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

/** Validate a JSON value against a JSON Schema (draft-07 and 2019-09/2020-12 basics). Runs entirely in the browser — no network call. */
export function validateAgainstSchema(schema: unknown, value: unknown): SchemaValidationResult {
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
