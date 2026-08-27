import Ajv, { type ErrorObject } from "ajv";

export type SchemaIssue = {
  path: string;
  message: string;
};

export type SchemaValidationResult =
  | { ok: true; issues: SchemaIssue[] }
  | { ok: false; issues: SchemaIssue[] };

const formatPath = (instancePath: string): string => {
  if (!instancePath) return "$ (root)";
  return "$" + instancePath.replace(/\//g, ".").replace(/\.(\d+)/g, "[$1]");
};

const formatIssue = (error: ErrorObject): SchemaIssue => ({
  path: formatPath(error.instancePath),
  message: `${error.message ?? "is invalid"}${error.params && "allowedValues" in error.params ? ` (${(error.params as { allowedValues: unknown[] }).allowedValues.join(", ")})` : ""}`,
});

/**
 * Reject regex patterns that can backtrack catastrophically.
 *
 * A JSON Schema `pattern` is compiled straight to a JavaScript RegExp and run
 * on the main thread. Measured here: `^(a+)+$` against 41 non-matching
 * characters took **114 seconds** — a hard freeze of the tab with no way to
 * cancel it. Ajv has no regex timeout and JS regexes are not interruptible,
 * so the only place to stop this is before compiling.
 *
 * The signature is a quantifier applied to a group that itself ends in a
 * quantifier — (a+)+, (a*)* , (a+)* and friends — which is what produces
 * exponential backtracking. This is a deliberately narrow check: it is meant
 * to catch the classic footgun without rejecting ordinary patterns.
 */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}]\)\s*[+*]|\((?:[^()\\]|\\.)*[+*]\)\s*\{\d+,?\d*\}/;

/** Longest string we will run a user-supplied pattern against. */
const MAX_PATTERN_INPUT = 5_000;

/** Walk a schema and collect every `pattern` / `patternProperties` key. */
function collectPatterns(node: unknown, out: string[] = []): string[] {
  if (node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectPatterns(item, out);
    return out;
  }
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (key === "pattern" && typeof val === "string") out.push(val);
    else if (key === "patternProperties" && val && typeof val === "object") {
      out.push(...Object.keys(val as object));
      collectPatterns(val, out);
    } else collectPatterns(val, out);
  }
  return out;
}

/** True when a schema contains a pattern that could hang the tab. */
export function findUnsafePattern(schema: unknown): string | null {
  for (const pattern of collectPatterns(schema)) {
    if (NESTED_QUANTIFIER.test(pattern)) return pattern;
  }
  return null;
}

/** Validate a JSON value against a JSON Schema (draft-07 and 2019-09/2020-12 basics). Runs entirely in the browser — no network call. */
export function validateAgainstSchema(schema: unknown, value: unknown): SchemaValidationResult {
  // Refuse before Ajv compiles: once a catastrophic regex is running there is
  // no way to interrupt it, so the tab is simply gone.
  const unsafe = findUnsafePattern(schema);
  if (unsafe) {
    return {
      ok: false,
      issues: [{
        path: "$ (schema)",
        message: `Pattern "${unsafe.length > 60 ? unsafe.slice(0, 60) + "…" : unsafe}" has nested quantifiers and can hang the browser (catastrophic backtracking). Rewrite it before validating.`,
      }],
    };
  }

  // Bound the input a pattern runs against — backtracking cost grows with
  // input length, so this caps the damage from patterns the check misses.
  const oversized = typeof value === "string" && value.length > MAX_PATTERN_INPUT;
  if (oversized && collectPatterns(schema).length > 0) {
    return {
      ok: false,
      issues: [{
        path: "$ (schema)",
        message: `Value is ${value.length.toLocaleString()} characters — too long to run a regex pattern against safely (limit ${MAX_PATTERN_INPUT.toLocaleString()}).`,
      }],
    };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema as object);
  const valid = validate(value);
  if (valid) return { ok: true, issues: [] };
  return { ok: false, issues: (validate.errors ?? []).map(formatIssue) };
}

/** Automatically infer a draft-07 JSON Schema from an example JSON value. */
export function inferJsonSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: "null" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  if (typeof value === "string") return { type: "string" };

  if (Array.isArray(value)) {
    const itemSchemas = value.map((item) => inferJsonSchema(item));
    return {
      type: "array",
      items: itemSchemas.length > 0 ? itemSchemas[0] : {},
    };
  }

  if (typeof value === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = inferJsonSchema(child);
      required.push(key);
    }
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required,
      properties,
    };
  }

  return { type: "object" };
}
