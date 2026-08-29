import type { SnapshotNote } from "./snapshot";

type Primitive = string | number | boolean | null;

/** Flatten one record into dot-path columns (nested objects/arrays supported). */
const flattenRecord = (
  value: unknown,
  path = "",
): Record<string, Primitive> => {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0)
      return path ? { [path]: Array.isArray(value) ? "[]" : "{}" } : {};
    return entries.reduce(
      (result, [key, child]) =>
        Object.assign(
          result,
          flattenRecord(child, path ? `${path}.${key}` : key),
        ),
      {} as Record<string, Primitive>,
    );
  }
  return { [path || "value"]: value as Primitive };
};

const escapeCsvCell = (value: Primitive): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Convert JSON to CSV. Arrays of objects become one row per element; a single
 * object becomes a single-row CSV. Nested fields turn into dot-path columns.
 */
export function jsonToCsv(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return "";
  const flattened = rows.map((row) => flattenRecord(row));
  const headers = Array.from(
    new Set(flattened.flatMap((row) => Object.keys(row))),
  );
  const lines = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (const row of flattened) {
    lines.push(
      headers.map((header) => escapeCsvCell(row[header] ?? null)).join(","),
    );
  }
  return lines.join("\n");
}

/** Extract # comment metadata lines and data lines from CSV text. */
export function extractCsvNotesAndData(text: string): {
  dataText: string;
  notes: SnapshotNote[] | null;
} {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const commentLines = lines.filter((l) => l.trim().startsWith("#"));
  const dataLines = lines.filter((l) => !l.trim().startsWith("#"));
  const dataText = dataLines.join("\n");

  if (commentLines.length === 0) return { dataText, notes: null };

  const notes: SnapshotNote[] = [];
  let currentNote: SnapshotNote | null = null;

  for (const line of commentLines) {
    const trimmed = line.replace(/^#\s*/, "").trim();
    const noteMatch = trimmed.match(/^- \[([^\]]+)\] ([^:]+): (.*)$/);
    if (noteMatch) {
      const path = noteMatch[1];
      const title = noteMatch[2];
      let body = noteMatch[3];
      let mention = "";
      const mentionMatch = body.match(/\s*\(@([^)]+)\)$/);
      if (mentionMatch) {
        mention = mentionMatch[1];
        body = body.replace(/\s*\(@([^)]+)\)$/, "");
      }
      currentNote = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title,
        text: body,
        path,
        line: 1,
        mention,
        color: "bg-cyan-400",
        replies: [],
      };
      notes.push(currentNote);
    } else if (currentNote) {
      const replyMatch = trimmed.match(/^Reply \((?:@([^)]+)|user)\): (.*)$/);
      if (replyMatch) {
        currentNote.replies = currentNote.replies || [];
        currentNote.replies.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          text: replyMatch[2],
          mention: replyMatch[1] || "",
          at: Date.now(),
        });
      }
    }
  }

  return { dataText, notes: notes.length > 0 ? notes : null };
}

/** Parse one CSV line respecting quoted cells. */
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

const coerceCell = (text: string): Primitive => {
  if (text === "") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return Number(text);
  return text;
};

/** Rebuild nested structure from dot-path column names. */
const setDeep = (
  target: Record<string, unknown>,
  path: string,
  value: Primitive,
): void => {
  const segments = path.split(".");
  let node: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
};

/** Convert CSV text (with a header row) into an array of JSON objects. */
export function csvToJson(text: string): Record<string, unknown>[] {
  const { dataText } = extractCsvNotesAndData(text);
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of dataText) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);
  const rows = lines.filter((line) => line.trim() !== "");
  if (rows.length < 1) throw new Error("CSV needs at least a header row");
  const headers = parseCsvLine(rows[0]).map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const cells = parseCsvLine(row);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) setDeep(record, header, coerceCell(cells[index] ?? ""));
    });
    return record;
  });
}

export type QueryMatch = { path: string; value: unknown };

/**
 * Query JSON with a JSONPath-like syntax:
 *   settings.rateLimit           — dot paths
 *   endpoints[0].name            — array index
 *   endpoints[*].method          — every element
 *   *.name                       — wildcard key
 *   endpoints[?auth=true].path   — filter array elements by field value
 */
export function queryJson(root: unknown, query: string): QueryMatch[] {
  const trimmed = query.trim().replace(/^\$\.?/, "");
  if (!trimmed) return [{ path: "$", value: root }];

  // Split into segments on dots outside brackets.
  const segments: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of trimmed) {
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (char === "." && depth === 0) {
      if (current) segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) segments.push(current);

  let matches: QueryMatch[] = [{ path: "$", value: root }];
  for (const segment of segments) {
    const match = segment.match(/^([^[\]]*)((\[[^\]]*\])*)$/);
    if (!match) return [];
    const key = match[1];
    const brackets = Array.from(segment.matchAll(/\[([^\]]*)\]/g)).map(
      (m) => m[1],
    );

    if (key) {
      matches = matches.flatMap((entry) => {
        const value = entry.value;
        if (value === null || typeof value !== "object") return [];
        if (key === "*") {
          return Object.entries(value as Record<string, unknown>).map(
            ([childKey, child]) => ({
              path: Array.isArray(value)
                ? `${entry.path}[${childKey}]`
                : `${entry.path}.${childKey}`,
              value: child,
            }),
          );
        }
        const record = value as Record<string, unknown>;
        return key in record
          ? [{ path: `${entry.path}.${key}`, value: record[key] }]
          : [];
      });
    }

    for (const bracket of brackets) {
      matches = matches.flatMap((entry) => {
        const value = entry.value;
        if (!Array.isArray(value)) return [];
        if (bracket === "*" || bracket === "") {
          return value.map((child, index) => ({
            path: `${entry.path}[${index}]`,
            value: child,
          }));
        }
        const filter = bracket.match(/^\?\s*([^=!<>]+?)\s*(=|!=|>|<)\s*(.+)$/);
        if (filter) {
          const [, field, op, rawTarget] = filter;
          const target = rawTarget.trim().replace(/^["']|["']$/g, "");
          return value.flatMap((child, index) => {
            const childValue =
              child !== null && typeof child === "object"
                ? (child as Record<string, unknown>)[field.trim()]
                : undefined;
            const text =
              childValue === undefined ? undefined : String(childValue);
            const numeric = Number(childValue);
            const targetNumeric = Number(target);
            const passes =
              op === "="
                ? text === target
                : op === "!="
                  ? text !== undefined && text !== target
                  : op === ">"
                    ? !Number.isNaN(numeric) &&
                      !Number.isNaN(targetNumeric) &&
                      numeric > targetNumeric
                    : !Number.isNaN(numeric) &&
                      !Number.isNaN(targetNumeric) &&
                      numeric < targetNumeric;
            return passes
              ? [{ path: `${entry.path}[${index}]`, value: child }]
              : [];
          });
        }
        const index = Number(bracket);
        if (Number.isInteger(index) && index >= 0 && index < value.length) {
          return [{ path: `${entry.path}[${index}]`, value: value[index] }];
        }
        return [];
      });
    }
  }
  return matches;
}

/** Immutably set a value at a path expressed as segments (object keys / array indexes). */
export function setAtPath(
  root: unknown,
  segments: (string | number)[],
  value: unknown,
): unknown {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[Number(head)] = setAtPath(copy[Number(head)], rest, value);
    return copy;
  }
  if (root !== null && typeof root === "object") {
    return {
      ...(root as Record<string, unknown>),
      [head]: setAtPath(
        (root as Record<string, unknown>)[String(head)],
        rest,
        value,
      ),
    };
  }
  return root;
}
