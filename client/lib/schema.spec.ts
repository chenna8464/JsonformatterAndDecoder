import { describe, expect, it } from "vitest";
import { findUnsafePattern, inferJsonSchema, validateAgainstSchema } from "./schema";

describe("validateAgainstSchema", () => {
  const schema = {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string" },
      age: { type: "number", minimum: 0 },
      role: { enum: ["admin", "user"] },
    },
  };

  it("passes a value that satisfies the schema", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: 36, role: "admin" });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports missing required fields with a readable path", () => {
    const result = validateAgainstSchema(schema, { name: "Ada" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.message.includes("age"))).toBe(true);
  });

  it("reports type mismatches with the failing path", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: "not a number" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe("$.age");
  });

  it("formats enum parameters cleanly", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: 36, role: "invalid" });
    expect(result.ok).toBe(false);
  });

  it("reports enum violations", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: 1, role: "root" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.message.includes("admin"))).toBe(true);
  });

  it("validates arrays with a nested path pointing at the failing index", () => {
    const arraySchema = { type: "array", items: { type: "number" } };
    const result = validateAgainstSchema(arraySchema, [1, 2, "oops"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe("$[2]");
  });
});

describe("inferJsonSchema", () => {
  it("generates a draft-07 JSON Schema from a sample object", () => {
    const inferred = inferJsonSchema({ name: "Northstar", version: 2, active: true });
    expect(inferred.type).toBe("object");
    expect(inferred.required).toEqual(["name", "version", "active"]);
    expect((inferred.properties as any).name.type).toBe("string");
    expect((inferred.properties as any).version.type).toBe("integer");
  });
});

describe("ReDoS protection", () => {
  it("refuses a nested-quantifier pattern instead of hanging", () => {
    const started = Date.now();
    const result = validateAgainstSchema({ type: "string", pattern: "^(a+)+$" }, "a".repeat(40) + "!");
    // Before the guard this took ~114 SECONDS. It must now return immediately.
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain("catastrophic backtracking");
  });

  it("catches the variants, not just (a+)+", () => {
    for (const pattern of ["^(a*)*$", "^(a+)*$", "^([a-z]+)+$", "(x+x+)+y", "^(a+){2,}$"]) {
      expect(findUnsafePattern({ type: "string", pattern }), pattern).toBe(pattern);
    }
  });

  it("finds patterns nested deep in a schema", () => {
    expect(findUnsafePattern({
      type: "object",
      properties: { a: { type: "array", items: { type: "string", pattern: "^(a+)+$" } } },
    })).toBe("^(a+)+$");
  });

  it("checks patternProperties keys too", () => {
    expect(findUnsafePattern({ patternProperties: { "^(a+)+$": { type: "string" } } })).toBe("^(a+)+$");
  });

  it("does not reject ordinary patterns", () => {
    for (const pattern of [
      "^[a-z]+$", "^\\d{4}-\\d{2}-\\d{2}$", "^https?://.+$",
      "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$", "^(cat|dog)$", "[0-9]*",
    ]) {
      expect(findUnsafePattern({ type: "string", pattern }), pattern).toBeNull();
    }
  });

  it("still validates normally when no pattern is risky", () => {
    expect(validateAgainstSchema({ type: "string", pattern: "^a+$" }, "aaa").ok).toBe(true);
    expect(validateAgainstSchema({ type: "string", pattern: "^a+$" }, "bbb").ok).toBe(false);
  });

  it("refuses to run a pattern against an oversized string", () => {
    const r = validateAgainstSchema({ type: "string", pattern: "^a+$" }, "a".repeat(6000));
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toContain("too long");
  });

  it("allows oversized values when the schema has no pattern", () => {
    expect(validateAgainstSchema({ type: "string" }, "a".repeat(6000)).ok).toBe(true);
  });
});
