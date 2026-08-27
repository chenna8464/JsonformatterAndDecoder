import { describe, expect, it } from "vitest";
import { canonicalize, compareJson, flattenPaths } from "./compare";

const ok = (result: ReturnType<typeof compareJson>) => {
  if (result.error) throw new Error(`expected success, got: ${result.error.message}`);
  return result;
};

describe("canonicalize", () => {
  it("makes key order irrelevant", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("still distinguishes different values", () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });

  it("respects array order by default", () => {
    expect(canonicalize(["a", "b"])).not.toBe(canonicalize(["b", "a"]));
  });

  it("ignores array order when asked", () => {
    expect(canonicalize(["a", "b"], "ignore")).toBe(canonicalize(["b", "a"], "ignore"));
  });

  it("sorts nested keys too", () => {
    expect(canonicalize({ x: { p: 1, q: 2 } })).toBe(canonicalize({ x: { q: 2, p: 1 } }));
  });
});

describe("flattenPaths", () => {
  it("builds dotted and indexed paths", () => {
    const map = flattenPaths({ a: { b: 1 }, list: [10, 20] });
    expect([...map.keys()].sort()).toEqual(["a.b", "list[0]", "list[1]"]);
    expect(map.get("a.b")).toBe("1");
  });

  it("records empty containers rather than dropping them", () => {
    const map = flattenPaths({ empty: {}, none: [] });
    expect(map.get("empty")).toBe("{}");
    expect(map.get("none")).toBe("[]");
  });
});

describe("compareJson — the reordering pain point", () => {
  const A = JSON.stringify({ name: "Ada", role: "eng", team: "core" }, null, 2);
  const B = JSON.stringify({ team: "core", name: "Ada", role: "eng" }, null, 2);

  it("reports zero differences when only key order changed", () => {
    const r = ok(compareJson(A, B));
    expect(r.values).toEqual([]);
    expect(r.identical).toBe(true);
  });

  it("flags it as reordered so the UI can explain the emptiness", () => {
    const r = ok(compareJson(A, B));
    expect(r.reorderedOnly).toBe(true);
    expect(r.counts.moved).toBeGreaterThan(0);
  });

  it("does not claim 'reordered' for byte-identical input", () => {
    const r = ok(compareJson(A, A));
    expect(r.identical).toBe(true);
    expect(r.reorderedOnly).toBe(false);
  });

  it("finds the real change even when keys were also shuffled", () => {
    const changed = JSON.stringify({ team: "core", role: "staff", name: "Ada" }, null, 2);
    const r = ok(compareJson(A, changed));
    expect(r.values).toHaveLength(1);
    expect(r.values[0]).toMatchObject({ path: "role", before: '"eng"', after: '"staff"', kind: "changed" });
    expect(r.reorderedOnly).toBe(false);
  });
});

describe("compareJson — keys view", () => {
  it("separates keys that exist on only one side", () => {
    const r = ok(compareJson(
      JSON.stringify({ keep: 1, goes: 2 }),
      JSON.stringify({ keep: 1, arrives: 3 })
    ));
    expect(r.keysOnlyInLeft).toEqual(["goes"]);
    expect(r.keysOnlyInRight).toEqual(["arrives"]);
    expect(r.counts.removed).toBe(1);
    expect(r.counts.added).toBe(1);
  });

  it("reports nested missing keys by full path", () => {
    const r = ok(compareJson(
      JSON.stringify({ cfg: { a: 1, b: 2 } }),
      JSON.stringify({ cfg: { a: 1 } })
    ));
    expect(r.keysOnlyInLeft).toEqual(["cfg.b"]);
  });
});

describe("compareJson — values view", () => {
  it("marks a type-only change", () => {
    const r = ok(compareJson(JSON.stringify({ port: 8080 }), JSON.stringify({ port: "8080" })));
    expect(r.values[0]).toMatchObject({ path: "port", kind: "changed", typeChanged: true });
  });

  it("does not mark a genuine value change as a type change", () => {
    const r = ok(compareJson(JSON.stringify({ port: 8080 }), JSON.stringify({ port: 9090 })));
    expect(r.values[0].typeChanged).toBeUndefined();
  });

  it("treats array reordering as a difference by default", () => {
    const r = ok(compareJson(JSON.stringify({ t: ["a", "b"] }), JSON.stringify({ t: ["b", "a"] })));
    expect(r.identical).toBe(false);
    expect(r.values.length).toBeGreaterThan(0);
  });

  it("treats array reordering as equal when array order is ignored", () => {
    const r = ok(compareJson(
      JSON.stringify({ t: ["a", "b"] }),
      JSON.stringify({ t: ["b", "a"] }),
      { arrayOrder: "ignore" }
    ));
    expect(r.identical).toBe(true);
    expect(r.values).toEqual([]);
  });

  it("still catches a changed element when array order is ignored", () => {
    const r = ok(compareJson(
      JSON.stringify({ t: ["a", "b"] }),
      JSON.stringify({ t: ["b", "c"] }),
      { arrayOrder: "ignore" }
    ));
    expect(r.identical).toBe(false);
    expect(r.values.length).toBeGreaterThan(0);
  });

  it("matches objects inside an unordered array by content", () => {
    const r = ok(compareJson(
      JSON.stringify({ users: [{ id: 2, n: "b" }, { id: 1, n: "a" }] }),
      JSON.stringify({ users: [{ id: 1, n: "a" }, { id: 2, n: "b" }] }),
      { arrayOrder: "ignore" }
    ));
    expect(r.identical).toBe(true);
  });
});

describe("compareJson — invalid input", () => {
  it("names the offending side", () => {
    expect(compareJson("{ nope", "{}").error?.side).toBe("left");
    expect(compareJson("{}", "{ nope").error?.side).toBe("right");
    expect(compareJson("{ nope", "] also nope").error?.side).toBe("both");
  });

  it("carries a message the UI can show", () => {
    const bad = compareJson("{ nope", "{}");
    expect(bad.error?.message.length).toBeGreaterThan(0);
  });

  it("returns empty collections on failure so callers need no narrowing", () => {
    const bad = compareJson("{ nope", "{}");
    expect(bad.values).toEqual([]);
    expect(bad.keysOnlyInLeft).toEqual([]);
    expect(bad.identical).toBe(false);
    expect(bad.counts).toEqual({ changed: 0, added: 0, removed: 0, moved: 0 });
  });
});

describe("compareJson — realistic config drift", () => {
  it("surfaces only the two real changes among reordered keys", () => {
    const staging = JSON.stringify({
      service: "api", replicas: 2, region: "eu-west-1",
      flags: { beta: true, tracing: false },
    }, null, 2);
    const prod = JSON.stringify({
      region: "us-east-1",
      flags: { tracing: false, beta: true },
      service: "api", replicas: 6,
    }, null, 2);

    const r = ok(compareJson(staging, prod));
    expect(r.values.map((v) => v.path).sort()).toEqual(["region", "replicas"]);
    expect(r.counts.changed).toBe(2);
    expect(r.counts.added).toBe(0);
    expect(r.counts.removed).toBe(0);
  });
});
