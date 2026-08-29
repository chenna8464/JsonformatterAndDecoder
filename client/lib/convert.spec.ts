import { describe, expect, it } from "vitest";
import {
  csvToJson,
  extractCsvNotesAndData,
  jsonToCsv,
  queryJson,
  setAtPath,
} from "./convert";

describe("jsonToCsv", () => {
  it("converts an array of objects with nested fields", () => {
    const csv = jsonToCsv([
      { name: "Ada", meta: { role: "eng" } },
      { name: "Lin, MD", meta: { role: "ops" }, extra: true },
    ]);
    expect(csv.split("\n")[0]).toBe("name,meta.role,extra");
    expect(csv).toContain('"Lin, MD",ops,true');
    expect(csv.split("\n")[1]).toBe("Ada,eng,");
  });

  it("converts a single object to a one-row CSV", () => {
    expect(jsonToCsv({ a: 1, b: "x" })).toBe("a,b\n1,x");
  });
});

describe("csvToJson", () => {
  it("parses headers, quoted cells, and coerces types", () => {
    const rows = csvToJson(
      'name,age,active,note\n"Lin, MD",42,true,"said ""hi"""\nAda,36,false,',
    );
    expect(rows).toEqual([
      { name: "Lin, MD", age: 42, active: true, note: 'said "hi"' },
      { name: "Ada", age: 36, active: false, note: null },
    ]);
  });

  it("rebuilds nested objects from dot-path headers", () => {
    expect(csvToJson("name,meta.role\nAda,eng")).toEqual([
      { name: "Ada", meta: { role: "eng" } },
    ]);
  });

  it("round-trips with jsonToCsv", () => {
    const original = [{ name: "Ada", meta: { role: "eng" }, age: 36 }];
    expect(csvToJson(jsonToCsv(original))).toEqual(original);
  });

  it("converts JSON to clean raw CSV without comments", () => {
    const csv = jsonToCsv([{ rateLimit: 100 }]);
    expect(csv).toBe("rateLimit\n100");
    expect(csvToJson(csv)).toEqual([{ rateLimit: 100 }]);
  });
});

const sample = {
  settings: { rateLimit: 100 },
  endpoints: [
    { name: "get", method: "GET", auth: true },
    { name: "patch", method: "PATCH", auth: false },
  ],
};

describe("queryJson", () => {
  it("resolves dot paths and indexes", () => {
    expect(queryJson(sample, "settings.rateLimit")).toEqual([
      { path: "$.settings.rateLimit", value: 100 },
    ]);
    expect(queryJson(sample, "endpoints[1].name")).toEqual([
      { path: "$.endpoints[1].name", value: "patch" },
    ]);
  });

  it("supports wildcards over arrays and objects", () => {
    expect(
      queryJson(sample, "endpoints[*].method").map((m) => m.value),
    ).toEqual(["GET", "PATCH"]);
    expect(queryJson(sample, "settings.*").map((m) => m.value)).toEqual([100]);
  });

  it("supports filters", () => {
    expect(
      queryJson(sample, "endpoints[?auth=true].name").map((m) => m.value),
    ).toEqual(["get"]);
    expect(
      queryJson(sample, "endpoints[?method!=GET].name").map((m) => m.value),
    ).toEqual(["patch"]);
  });

  it("returns empty for non-matching paths", () => {
    expect(queryJson(sample, "nope.nothing")).toEqual([]);
  });
});

describe("setAtPath", () => {
  it("immutably updates nested values including array elements", () => {
    const updated = setAtPath(
      sample,
      ["endpoints", 0, "method"],
      "POST",
    ) as typeof sample;
    expect(updated.endpoints[0].method).toBe("POST");
    expect(sample.endpoints[0].method).toBe("GET");
  });
});
