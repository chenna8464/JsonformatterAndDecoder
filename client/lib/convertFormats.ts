import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { parse as tomlParse, stringify as tomlStringify } from "smol-toml";

export type ConvertFormat = "yaml" | "xml" | "toml";

export type FormatInfo = {
  id: ConvertFormat;
  label: string;
  ext: string;
  /** TOML/XML can't represent every JSON shape (e.g. a top-level array or scalar) */
  note?: string;
};

export const CONVERT_FORMATS: FormatInfo[] = [
  { id: "yaml", label: "YAML", ext: "yaml" },
  {
    id: "xml",
    label: "XML",
    ext: "xml",
    note: "XML needs a single root object.",
  },
  {
    id: "toml",
    label: "TOML",
    ext: "toml",
    note: "TOML needs a top-level object (no arrays/scalars at the root).",
  },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  trimValues: true,
});
const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  indentBy: "  ",
});

/**
 * Ceiling on how many nodes a converted document may expand to.
 *
 * Far above any hand-written config — a 10 MB YAML file sits well under this —
 * and far below the point where serialising freezes the tab.
 */
const MAX_EXPANDED_NODES = 1_000_000;

/**
 * Exact count of the nodes a value expands to once serialised, or `null` if it
 * exceeds MAX_EXPANDED_NODES or contains a reference cycle.
 *
 * Why this exists: YAML anchors and aliases let a few hundred bytes describe an
 * enormous tree. js-yaml resolves an alias by *reusing the same object*, so
 * `load` stays fast and cheap — it hands back a small DAG, not a big tree. The
 * blowup lands entirely on `JSON.stringify`, which has no concept of sharing and
 * walks every path through that DAG. Measured on a 9-way fan-out:
 *
 *     input   load    stringify   output
 *     273 B   2 ms      7 ms       2.5 MB
 *     319 B   1 ms     60 ms        23 MB
 *     365 B   0 ms    537 ms       206 MB   (~2 s once pretty-printed)
 *
 * One more level of nesting multiplies that again, so a sub-500-byte paste can
 * take the tab out. Counting first is what makes rejection safe: memoising per
 * object identity keeps the walk at O(unique nodes) — it measured 0 ms on every
 * bomb above — while still returning the true expanded size.
 */
const countExpandedNodes = (root: unknown): number | null => {
  const memo = new Map<object, number>();
  const inProgress = new Set<object>();
  let failed = false;

  const walk = (value: unknown): number => {
    if (failed) return 0;
    if (value === null || typeof value !== "object") return 1;
    const node = value as object;

    const cached = memo.get(node);
    if (cached !== undefined) return cached;
    // A YAML anchor can reference itself (`a: &a [*a]`). That is a cycle, not a
    // large tree, and JSON cannot represent it at all.
    if (inProgress.has(node)) {
      failed = true;
      return 0;
    }

    inProgress.add(node);
    let total = 1;
    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      total += walk(child);
      if (total > MAX_EXPANDED_NODES) {
        failed = true;
        break;
      }
    }
    inProgress.delete(node);

    if (failed) return 0;
    memo.set(node, total);
    return total;
  };

  const total = walk(root);
  return failed ? null : total;
};

// Flat (non-discriminated) shape: this project builds with strictNullChecks
// off, where TypeScript won't narrow a discriminated union on its false branch.
// Keeping both fields always-accessible avoids that pitfall.
export type ConvertResult = { ok: boolean; value?: string; error?: string };

/** Convert a JSON string into YAML / XML / TOML. */
export function jsonToFormat(
  jsonString: string,
  format: ConvertFormat,
): ConvertResult {
  let value: unknown;
  try {
    value = JSON.parse(jsonString);
  } catch {
    return {
      ok: false,
      error: "The document is not valid JSON. Fix it (or hit Format) first.",
    };
  }

  try {
    if (format === "yaml") {
      return {
        ok: true,
        value: yamlDump(value, { indent: 2, lineWidth: 120, noRefs: true }),
      };
    }
    if (format === "toml") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {
          ok: false,
          error:
            "TOML needs a top-level object. Wrap arrays/scalars in an object first.",
        };
      }
      return {
        ok: true,
        value: tomlStringify(value as Record<string, unknown>),
      };
    }
    // XML
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        error:
          "XML needs a single root object. Wrap arrays/scalars in an object first.",
      };
    }
    return { ok: true, value: xmlBuilder.build(value) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Could not convert to ${format.toUpperCase()}.`,
    };
  }
}

/** Convert YAML / XML / TOML text back into a formatted JSON string. */
export function formatToJson(
  text: string,
  format: ConvertFormat,
): ConvertResult {
  try {
    let value: unknown;
    if (format === "yaml") value = yamlLoad(text);
    else if (format === "toml") value = tomlParse(text);
    else value = xmlParser.parse(text);

    // Measure before serialising — see countExpandedNodes. Cheap on the DAG,
    // and the last point at which an alias bomb is still stoppable.
    if (countExpandedNodes(value) === null) {
      return {
        ok: false,
        error:
          format === "yaml"
            ? "This YAML expands to too much data to convert. Anchors and aliases (&name / *name) that reference each other multiply into millions of nodes — check for a self-referencing or deeply repeated anchor."
            : "This document expands to too much data to convert.",
      };
    }

    return { ok: true, value: JSON.stringify(value, null, 2) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Could not parse the ${format.toUpperCase()}.`,
    };
  }
}
