import { describe, expect, it } from "vitest";
import { arrayObjectFields, sortJsonValue } from "./sort";

describe("sortJsonValue", () => {
  it("sorts an array of primitives ascending and descending", () => {
    expect(sortJsonValue([3, 1, 2], "asc")).toEqual([1, 2, 3]);
    expect(sortJsonValue([3, 1, 2], "desc")).toEqual([3, 2, 1]);
  });

  it("sorts an array of objects by a field", () => {
    const rows = [{ name: "b", age: 2 }, { name: "a", age: 1 }];
    expect(sortJsonValue(rows, "asc", "name")).toEqual([{ name: "a", age: 1 }, { name: "b", age: 2 }]);
    expect(sortJsonValue(rows, "desc", "age")).toEqual([{ name: "b", age: 2 }, { name: "a", age: 1 }]);
  });

  it("sorts object keys alphabetically", () => {
    expect(Object.keys(sortJsonValue({ z: 1, a: 2, m: 3 } as Record<string, unknown>, "asc") as object)).toEqual(["a", "m", "z"]);
  });

  it("numeric-aware string sort orders numbers naturally", () => {
    expect(sortJsonValue(["item10", "item2", "item1"], "asc")).toEqual(["item1", "item2", "item10"]);
  });
});

describe("arrayObjectFields", () => {
  it("collects the union of keys across array elements", () => {
    expect(arrayObjectFields([{ a: 1 }, { b: 2 }])).toEqual(["a", "b"]);
  });

  it("returns an empty array for non-arrays", () => {
    expect(arrayObjectFields({ a: 1 })).toEqual([]);
  });
});
