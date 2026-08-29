import { afterEach, describe, expect, it } from "vitest";
import { csvToJson, jsonToCsv, queryJson, setAtPath } from "./convert";

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

describe("csvToJson — prototype pollution (regression)", () => {
  // Before the fix, setDeep walked INTO Object.prototype: `typeof
  // node["__proto__"]` is "object" and non-null, so the "create the container if
  // it's missing" guard was satisfied by the prototype itself, and the final
  // assignment landed on Object.prototype. A two-line CSV — reachable just by
  // dropping a file on the window — set ({}).polluted for the whole page.
  //
  // Only names that must never exist on Object.prototype belong here.
  // Deliberately excludes real built-ins like `toString`: deleting one of those
  // to "clean up" breaks the runtime for every test that follows.
  const probeKeys = ["polluted", "isAdmin"];

  afterEach(() => {
    for (const key of probeKeys)
      delete (Object.prototype as Record<string, unknown>)[key];
  });

  it("does not pollute Object.prototype via a __proto__ header", () => {
    csvToJson("__proto__.polluted\npwned");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not pollute via a constructor.prototype header", () => {
    csvToJson("constructor.prototype.isAdmin\ntrue");
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("drops the unsafe column but still parses the safe ones", () => {
    const rows = csvToJson("name,__proto__.polluted,age\nAda,pwned,36");
    expect(rows).toEqual([{ name: "Ada", age: 36 }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("treats an inherited member as absent rather than as a container", () => {
    // `toString` exists on the prototype but not as an own property. The old
    // `typeof node[key] !== "object"` test consulted the chain.
    csvToJson("toString.x\ny");
    expect(typeof {}.toString).toBe("function");
  });
});

describe("queryJson — prototype chain (regression)", () => {
  it("does not report inherited members as matches", () => {
    // `key in record` walked the prototype chain, so these resolved to built-in
    // machinery and were rendered as though they were part of the document.
    expect(queryJson({ a: 1 }, "constructor")).toEqual([]);
    expect(queryJson({ a: 1 }, "toString")).toEqual([]);
    expect(queryJson({ a: 1 }, "__proto__")).toEqual([]);
  });

  it("still matches real own properties, including falsy values", () => {
    expect(queryJson({ a: 0 }, "a")).toEqual([{ path: "$.a", value: 0 }]);
    expect(queryJson({ constructor: "mine" }, "constructor")).toEqual([
      { path: "$.constructor", value: "mine" },
    ]);
  });
});
