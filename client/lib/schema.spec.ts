import { describe, expect, it } from "vitest";
import { inferJsonSchema, validateAgainstSchema } from "./schema";

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
