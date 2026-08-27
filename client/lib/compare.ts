/**
 * Structural comparison for the standalone Compare page.
 *
 * The problem this exists to solve: a line-by-line diff calls two documents
 * "completely different" when someone has merely reordered the keys. JSON
 * objects are unordered by definition, so `{a:1,b:2}` and `{b:2,a:1}` are the
 * same document — but a text diff has no way to know that and lights up every
 * moved line in red and green. That is noise, and it buries the one or two
 * changes that actually matter.
 *
 * So this module answers the structural question instead: for every PATH in
 * the document, what is the value, and where do the two sides disagree? Key
 * order never enters into it. Array order does by default (arrays are ordered
 * in JSON, so moving an element is a real change) but can be ignored on
 * request, because in practice arrays are often used as unordered sets.
 */

export type ArrayOrder = "strict" | "ignore";

export type ValueChange = {
  path: string;
  before: string;
  after: string;
  kind: "changed" | "added" | "removed";
  /** Set when only the JSON type changed, e.g. 42 → "42". */
  typeChanged?: boolean;
};

export type CompareOptions = {
  arrayOrder?: ArrayOrder;
};

export type CompareError = {
  /** Which input failed to parse, so the UI can point at the right pane. */
  side: "left" | "right" | "both";
  message: string;
};

/**
 * One flat shape rather than an ok:true / ok:false union.
 *
 * This project compiles with `strictNullChecks: false`, which switches off the
 * narrowing that a boolean-discriminated union depends on — `if (!r.ok)` does
 * not narrow, so every field access on the union fails to typecheck. A single
 * shape with a nullable `error` and always-present collections sidesteps that
 * entirely, and callers just check `result.error`.
 */
export type CompareResult = {
  /** null when both sides parsed. */
  error: CompareError | null;
  /** Same data once key order is disregarded. */
  identical: boolean;
  /**
   * The headline for the pain point: the two documents ARE the same, and the
   * only reason they looked different is that the text was arranged
   * differently. When this is true the UI should say so plainly rather than
   * showing an empty diff and leaving the user wondering.
   */
  reorderedOnly: boolean;
  values: ValueChange[];
  /** Paths present on one side only — the "keys" view groups these. */
  keysOnlyInLeft: string[];
  keysOnlyInRight: string[];
  /** Paths whose position moved but whose value is unchanged. */
  movedKeys: string[];
  counts: { changed: number; added: number; removed: number; moved: number };
};

/** An empty result, used when a side could not be parsed. */
const emptyResult = (error: CompareError | null): CompareResult => ({
  error,
  identical: false,
  reorderedOnly: false,
  values: [],
  keysOnlyInLeft: [],
  keysOnlyInRight: [],
  movedKeys: [],
  counts: { changed: 0, added: 0, removed: 0, moved: 0 },
});

const typeOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

/** Render a leaf for display. Objects/arrays are summarised, not dumped. */
const formatLeaf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length ? `[${value.length} items]` : "[]";
  if (typeof value === "object") {
    const n = Object.keys(value as object).length;
    return n ? `{${n} keys}` : "{}";
  }
  return JSON.stringify(value) ?? String(value);
};

/**
 * Deterministic serialisation with object keys sorted, used for equality
 * checks. Two documents that differ only in key order canonicalise to the
 * identical string — that single fact is what makes the whole page work.
 */
export function canonicalize(value: unknown, arrayOrder: ArrayOrder = "strict"): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";

  if (Array.isArray(value)) {
    const parts = value.map((item) => canonicalize(item, arrayOrder));
    // Sorting makes ["a","b"] and ["b","a"] compare equal. Only when asked:
    // for most JSON an array's order is meaningful.
    if (arrayOrder === "ignore") parts.sort();
    return `[${parts.join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [k, canonicalize(v, arrayOrder)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(",")}}`;
}

/**
 * Flatten to path → leaf. Object keys are visited in sorted order so the two
 * sides are always walked the same way regardless of how they were written.
 */
export function flattenPaths(
  value: unknown,
  arrayOrder: ArrayOrder = "strict",
  path = "",
  out: Map<string, string> = new Map()
): Map<string, string> {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      // With order ignored, sort by canonical form first so that element i on
      // the left is compared against the matching element on the right rather
      // than whatever happened to be written at that index.
      const items = arrayOrder === "ignore"
        ? [...value].sort((a, b) => (canonicalize(a, arrayOrder) < canonicalize(b, arrayOrder) ? -1 : 1))
        : value;
      if (items.length === 0) out.set(path || "$", "[]");
      items.forEach((item, i) => flattenPaths(item, arrayOrder, `${path}[${i}]`, out));
      return out;
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    if (entries.length === 0) out.set(path || "$", "{}");
    for (const [key, child] of entries) {
      flattenPaths(child, arrayOrder, path ? `${path}.${key}` : key, out);
    }
    return out;
  }
  out.set(path || "$", formatLeaf(value));
  return out;
}

/** Ordered list of object-key paths as they were WRITTEN, for move detection. */
function writtenKeyOrder(value: unknown, path = "", out: string[] = []): string[] {
  if (value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, i) => writtenKeyOrder(item, `${path}[${i}]`, out));
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = path ? `${path}.${key}` : key;
    out.push(next);
    writtenKeyOrder(child, next, out);
  }
  return out;
}

/** Compare two JSON texts structurally. */
export function compareJson(
  leftText: string,
  rightText: string,
  options: CompareOptions = {}
): CompareResult {
  const arrayOrder = options.arrayOrder ?? "strict";

  let left: unknown;
  let right: unknown;
  let leftError: string | null = null;
  let rightError: string | null = null;

  try {
    left = JSON.parse(leftText);
  } catch (error) {
    leftError = (error as Error).message;
  }
  try {
    right = JSON.parse(rightText);
  } catch (error) {
    rightError = (error as Error).message;
  }

  if (leftError && rightError) return emptyResult({ side: "both", message: leftError });
  if (leftError) return emptyResult({ side: "left", message: leftError });
  if (rightError) return emptyResult({ side: "right", message: rightError });

  const a = flattenPaths(left, arrayOrder);
  const b = flattenPaths(right, arrayOrder);
  const allPaths = Array.from(new Set([...a.keys(), ...b.keys()])).sort();

  const values: ValueChange[] = [];
  const keysOnlyInLeft: string[] = [];
  const keysOnlyInRight: string[] = [];

  for (const path of allPaths) {
    const before = a.get(path);
    const after = b.get(path);
    if (before === after) continue;

    if (after === undefined) {
      keysOnlyInLeft.push(path);
      values.push({ path, before: before!, after: "—", kind: "removed" });
    } else if (before === undefined) {
      keysOnlyInRight.push(path);
      values.push({ path, before: "—", after, kind: "added" });
    } else {
      // Flag type-only changes (42 vs "42") — a common and easily missed bug.
      const leftRaw = before;
      const rightRaw = after;
      const typeChanged =
        leftRaw.replace(/^"|"$/g, "") === rightRaw.replace(/^"|"$/g, "") && leftRaw !== rightRaw;
      values.push({ path, before, after, kind: "changed", ...(typeChanged ? { typeChanged } : {}) });
    }
  }

  const identical = canonicalize(left, arrayOrder) === canonicalize(right, arrayOrder);

  // A path counts as "moved" when it exists on both sides with the same value
  // but sits at a different position in the written order.
  const leftOrder = writtenKeyOrder(left);
  const rightOrder = writtenKeyOrder(right);
  const movedKeys = leftOrder.filter((path, index) => {
    const rightIndex = rightOrder.indexOf(path);
    return rightIndex !== -1 && rightIndex !== index && a.get(path) === b.get(path);
  });

  return {
    error: null,
    identical,
    // Only claim "reordered" when the data matches but the text does not —
    // that is precisely the case a line diff gets wrong.
    reorderedOnly: identical && leftText.trim() !== rightText.trim(),
    values,
    keysOnlyInLeft,
    keysOnlyInRight,
    movedKeys,
    counts: {
      changed: values.filter((v) => v.kind === "changed").length,
      added: values.filter((v) => v.kind === "added").length,
      removed: values.filter((v) => v.kind === "removed").length,
      moved: movedKeys.length,
    },
  };
}
