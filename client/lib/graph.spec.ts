import { describe, expect, it } from "vitest";
import { buildGraphModel } from "./graph";

describe("buildGraphModel", () => {
  it("puts primitive fields as rows on their container node", () => {
    const model = buildGraphModel({ name: "Ada", age: 36 });
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].rows.map((r) => r.key)).toEqual(["name", "age"]);
    expect(model.nodes[0].rows[0].type).toBe("string");
    expect(model.nodes[0].rows[1].type).toBe("number");
  });

  it("creates child nodes and edges for nested containers", () => {
    const model = buildGraphModel({ a: 1, meta: { role: "eng" }, tags: ["x"] });
    expect(model.nodes).toHaveLength(3); // root + meta + tags
    expect(model.edges).toHaveLength(2);
    const labels = model.edges.map((e) => e.label).sort();
    expect(labels).toEqual(["meta", "tags"]);
  });

  it("labels array element nodes by index", () => {
    const model = buildGraphModel({ items: [{ id: 1 }, { id: 2 }] });
    const arrayEdges = model.edges.filter((e) => e.label === "[0]" || e.label === "[1]");
    expect(arrayEdges).toHaveLength(2);
  });

  it("assigns increasing x by depth and non-negative bounds", () => {
    const model = buildGraphModel({ a: { b: { c: 1 } } });
    const xs = model.nodes.map((n) => n.x).sort((p, q) => p - q);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeGreaterThan(0);
    expect(model.width).toBeGreaterThan(0);
    expect(model.height).toBeGreaterThan(0);
  });

  it("wraps a primitive root in a single value node", () => {
    const model = buildGraphModel(42);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].kind).toBe("root");
    expect(model.nodes[0].rows[0].value).toBe("42");
  });

  it("caps the node count and flags truncation", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) big[`k${i}`] = { nested: { deeper: i } };
    const model = buildGraphModel(big, 10);
    expect(model.nodes.length).toBeLessThanOrEqual(10);
    expect(model.truncated).toBe(true);
  });

  describe("large array folding", () => {
    const bulk = (n: number) => ({
      items: Array.from({ length: n }, (_, i) => ({ id: i, name: `Item ${i}` })),
    });

    it("folds an oversized array into one summary node", () => {
      const model = buildGraphModel(bulk(200));
      // root + items — not 202 nodes.
      expect(model.nodes).toHaveLength(2);
      expect(model.collapsedPaths).toEqual(["$.items"]);
      expect(model.truncated).toBe(false); // folded, not lost
    });

    it("keeps the diagram small enough to read", () => {
      const folded = buildGraphModel(bulk(200));
      const expanded = buildGraphModel(bulk(200), { maxArrayChildren: Infinity });
      // The whole point: canvas height collapses by orders of magnitude.
      expect(folded.height).toBeLessThan(500);
      expect(expanded.height).toBeGreaterThan(15000);
    });

    it("reports the real item count and field shape on the summary", () => {
      const model = buildGraphModel(bulk(200));
      const items = model.nodes.find((n) => n.path === "$.items")!;
      expect(items.collapsed).toEqual({ total: 200, shown: 0, shape: ["id", "name"] });
      expect(items.rows.find((r) => r.key === "items")?.value).toBe("200");
      expect(items.rows.find((r) => r.key === "fields")?.value).toContain("id");
    });

    it("reports the full node count the document would need", () => {
      const model = buildGraphModel(bulk(200));
      expect(model.fullNodeCount).toBeGreaterThanOrEqual(201);
    });

    it("expands an array when its path is opted in", () => {
      const model = buildGraphModel(bulk(40), { expandedPaths: ["$.items"] });
      expect(model.nodes).toHaveLength(42); // root + items + 40
      expect(model.collapsedPaths).toEqual([]);
    });

    it("leaves small arrays alone", () => {
      const model = buildGraphModel(bulk(3));
      expect(model.nodes).toHaveLength(5); // root + items + 3
      expect(model.collapsedPaths).toEqual([]);
      expect(model.nodes.every((n) => !n.collapsed)).toBe(true);
    });

    it("does not fold wide objects — their keys are distinct fields", () => {
      const wide: Record<string, unknown> = {};
      for (let i = 0; i < 60; i++) wide[`field${i}`] = { v: i };
      const model = buildGraphModel(wide);
      expect(model.collapsedPaths).toEqual([]);
      expect(model.nodes).toHaveLength(61);
    });

    it("folds arrays of primitives? no — they were already rows", () => {
      const model = buildGraphModel({ tags: Array.from({ length: 200 }, (_, i) => `t${i}`) });
      expect(model.collapsedPaths).toEqual([]);
      expect(model.nodes).toHaveLength(2);
      expect(model.nodes[1].rows).toHaveLength(200);
    });

    it("still honours the numeric second-arg form", () => {
      const model = buildGraphModel({ a: { b: 1 } }, 1);
      expect(model.nodes).toHaveLength(1);
      expect(model.truncated).toBe(true);
    });
  });

  describe("layout modes", () => {
    // Wide + shallow: the shape where vertical should beat horizontal.
    const wide = { a: { v: 1 }, b: { v: 2 }, c: { v: 3 }, d: { v: 4 }, e: { v: 5 } };
    // Deep + narrow: the shape where horizontal should beat vertical.
    const deep = { a: { b: { c: { d: { e: 1 } } } } };

    it("defaults to horizontal", () => {
      const explicit = buildGraphModel(wide, { layout: "horizontal" });
      const implicit = buildGraphModel(wide);
      expect(implicit.nodes.map((n) => [n.x, n.y])).toEqual(explicit.nodes.map((n) => [n.x, n.y]));
    });

    it("horizontal grows along x with depth", () => {
      const m = buildGraphModel(deep, { layout: "horizontal" });
      const xs = [...new Set(m.nodes.map((n) => n.x))].sort((p, q) => p - q);
      expect(xs.length).toBe(m.nodes.length); // one column per depth
      expect(m.width).toBeGreaterThan(m.height);
    });

    it("vertical grows along y with depth", () => {
      const m = buildGraphModel(deep, { layout: "vertical" });
      const ys = [...new Set(m.nodes.map((n) => n.y))].sort((p, q) => p - q);
      expect(ys.length).toBe(m.nodes.length); // one row per depth
      expect(m.height).toBeGreaterThan(m.width);
    });

    it("vertical is more compact than horizontal for wide, shallow docs", () => {
      const h = buildGraphModel(wide, { layout: "horizontal" });
      const v = buildGraphModel(wide, { layout: "vertical" });
      // Horizontal stacks 5 siblings into a tall column; vertical spreads them.
      expect(v.height).toBeLessThan(h.height);
    });

    it("radial places nodes off a single axis", () => {
      const m = buildGraphModel(wide, { layout: "radial" });
      const distinctX = new Set(m.nodes.map((n) => Math.round(n.x)));
      const distinctY = new Set(m.nodes.map((n) => Math.round(n.y)));
      // Neither axis is degenerate — nodes ring outward in both.
      expect(distinctX.size).toBeGreaterThan(1);
      expect(distinctY.size).toBeGreaterThan(1);
    });

    it("every layout keeps all coordinates non-negative and bounds positive", () => {
      for (const layout of ["horizontal", "vertical", "radial"] as const) {
        const m = buildGraphModel(wide, { layout });
        expect(m.nodes.every((n) => n.x >= 0 && n.y >= 0), layout).toBe(true);
        expect(m.width, layout).toBeGreaterThan(0);
        expect(m.height, layout).toBeGreaterThan(0);
      }
    });

    it("layout never changes which nodes or edges exist", () => {
      const base = buildGraphModel(wide, { layout: "horizontal" });
      for (const layout of ["vertical", "radial"] as const) {
        const m = buildGraphModel(wide, { layout });
        expect(m.nodes.map((n) => n.path)).toEqual(base.nodes.map((n) => n.path));
        expect(m.edges).toEqual(base.edges);
      }
    });

    it("radial handles a single-node document without dividing by zero", () => {
      const m = buildGraphModel({ only: 1 }, { layout: "radial" });
      expect(m.nodes).toHaveLength(1);
      expect(Number.isFinite(m.nodes[0].x)).toBe(true);
      expect(Number.isFinite(m.nodes[0].y)).toBe(true);
    });

    it("composes with array folding", () => {
      const bulk = { items: Array.from({ length: 200 }, (_, i) => ({ id: i })) };
      const m = buildGraphModel(bulk, { layout: "radial" });
      expect(m.nodes).toHaveLength(2);
      expect(m.collapsedPaths).toEqual(["$.items"]);
    });
  });
});
