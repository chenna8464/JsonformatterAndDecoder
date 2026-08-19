import { describe, it, expect } from "vitest";
import { cn, getJsonErrorLine } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });
});

describe("getJsonErrorLine helper", () => {
  it("returns null for valid json", () => {
    expect(getJsonErrorLine('{"a":1}').line).toBeNull();
  });

  it("detects error line for malformed json", () => {
    const invalid = '{\n  "a": 1,\n  "b": \n}';
    const err = getJsonErrorLine(invalid);
    expect(err.line).toBeGreaterThan(0);
    expect(err.message).toBeDefined();
  });
});
