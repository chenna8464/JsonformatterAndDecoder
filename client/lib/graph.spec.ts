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
});
