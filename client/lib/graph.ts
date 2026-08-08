// Turn a JSON value into a node-link graph model (à la jsoncrack): each object
// or array is a node listing its primitive fields inline, with nested
// containers branching off as connected child nodes. Pure + testable; the React
// component handles rendering, pan/zoom, and export.

export type GraphValueType = "string" | "number" | "boolean" | "null";
export type GraphRow = { key: string; value: string; type: GraphValueType };
export type GraphNode = {
  id: string;
  path: string;
  label: string;
  kind: "object" | "array" | "root";
  rows: GraphRow[];
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GraphEdge = { from: string; to: string; label: string };
export type GraphModel = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  truncated: boolean;
};

export const NODE_WIDTH = 240;
const ROW_H = 22;
const HEADER_H = 30;
const PAD = 8;
const H_GAP = 64;
const V_GAP = 18;

const typeOf = (v: unknown): "object" | "array" | GraphValueType =>
  v === null ? "null" : Array.isArray(v) ? "array" : (typeof v as "string" | "number" | "boolean" | "object");

const formatValue = (v: unknown): string => {
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 34 ? text.slice(0, 33) + "…" : text;
};

type BuildNode = GraphNode & { children: BuildNode[] };

/** Build a laid-out graph model. Caps the node count so huge documents stay responsive. */
export function buildGraphModel(root: unknown, maxNodes = 600): GraphModel {
  const nodes: BuildNode[] = [];
  const edges: GraphEdge[] = [];
  let idCounter = 0;
  let truncated = false;

  const makeNode = (label: string, path: string, kind: BuildNode["kind"], rows: GraphRow[]): BuildNode => {
    const node: BuildNode = {
      id: `n${idCounter++}`,
      path,
      label,
      kind,
      rows,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: HEADER_H + Math.max(rows.length, 1) * ROW_H + PAD,
      children: [],
    };
    nodes.push(node);
    return node;
  };

  const build = (value: unknown, label: string, path: string): BuildNode | null => {
    if (nodes.length >= maxNodes) {
      truncated = true;
      return null;
    }
    const isArray = Array.isArray(value);
    const entries: [string, unknown][] = isArray
      ? (value as unknown[]).map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, unknown>);

    const rows: GraphRow[] = [];
    const childSpecs: { label: string; value: unknown; path: string }[] = [];
    for (const [k, v] of entries) {
      const t = typeOf(v);
      const childLabel = isArray ? `[${k}]` : k;
      const childPath = isArray ? `${path}[${k}]` : `${path}.${k}`;
      if (t === "object" || t === "array") childSpecs.push({ label: childLabel, value: v, path: childPath });
      else rows.push({ key: childLabel, value: formatValue(v), type: t });
    }

    const node = makeNode(label, path, isArray ? "array" : "object", rows);
    for (const spec of childSpecs) {
      const child = build(spec.value, spec.label, spec.path);
      if (child) {
        edges.push({ from: node.id, to: child.id, label: spec.label });
        node.children.push(child);
      }
    }
    return node;
  };

  const rootIsContainer = root !== null && typeof root === "object";
  const rootNode = rootIsContainer
    ? build(root, "root", "$")
    : makeNode("value", "$", "root", [{ key: "value", value: formatValue(root), type: typeOf(root) as GraphValueType }]);

  // Tidy left-to-right tree layout: depth sets x, an accumulating cursor sets y,
  // and each parent centers vertically on the span of its children.
  let cursorY = 0;
  const layout = (node: BuildNode, depth: number) => {
    node.x = depth * (NODE_WIDTH + H_GAP);
    if (node.children.length === 0) {
      node.y = cursorY;
      cursorY += node.height + V_GAP;
      return;
    }
    for (const child of node.children) layout(child, depth + 1);
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    node.y = (first.y + last.y + last.height) / 2 - node.height / 2;
    cursorY = Math.max(cursorY, node.y + node.height + V_GAP);
  };
  if (rootNode) layout(rootNode, 0);

  const width = nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
  const height = nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);

  return {
    nodes: nodes.map(({ children, ...rest }) => { void children; return rest; }),
    edges,
    width,
    height,
    truncated,
  };
}
