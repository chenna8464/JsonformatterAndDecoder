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
  /**
   * Set on an array node whose object children were folded into a single
   * summary instead of being expanded. `collapsed.shown` children were
   * drawn; the rest are represented by the summary rows.
   */
  collapsed?: { total: number; shown: number; shape: string[] };
};
export type GraphEdge = { from: string; to: string; label: string };
export type GraphModel = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  /** True when the hard node cap stopped the walk — data is MISSING. */
  truncated: boolean;
  /** Paths of arrays that were folded. Recoverable by expanding them. */
  collapsedPaths: string[];
  /** Total nodes the document would need if nothing were folded/capped. */
  fullNodeCount: number;
};

export const NODE_WIDTH = 240;
const ROW_H = 22;
const HEADER_H = 30;
const PAD = 8;
const H_GAP = 64;
const V_GAP = 18;
/** Extra node height reserved for the "expand N items" control. */
const COLLAPSE_CTA_H = 26;

const typeOf = (v: unknown): "object" | "array" | GraphValueType =>
  v === null ? "null" : Array.isArray(v) ? "array" : (typeof v as "string" | "number" | "boolean" | "object");

const formatValue = (v: unknown): string => {
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 34 ? text.slice(0, 33) + "…" : text;
};

type BuildNode = GraphNode & { children: BuildNode[] };

/**
 * How the tree is arranged on the canvas. All three keep node text upright
 * and axis-aligned — the reason this is a layout toggle rather than a 2D/3D
 * toggle is that reading keys and values is the whole job, and rotating text
 * out of plane destroys that.
 */
export type GraphLayout = "horizontal" | "vertical" | "radial";

/**
 * Horizontal: depth → x, a running cursor → y, parents centred on the
 * vertical span of their children. Best for deep nesting, because depth
 * grows along the axis screens have most of (and the one we can scroll).
 */
function layoutHorizontal(root: BuildNode) {
  let cursorY = 0;
  const walk = (node: BuildNode, depth: number) => {
    node.x = depth * (NODE_WIDTH + H_GAP);
    if (node.children.length === 0) {
      node.y = cursorY;
      cursorY += node.height + V_GAP;
      return;
    }
    for (const child of node.children) walk(child, depth + 1);
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    node.y = (first.y + last.y + last.height) / 2 - node.height / 2;
    cursorY = Math.max(cursorY, node.y + node.height + V_GAP);
  };
  walk(root, 0);
}

/**
 * Vertical: mirror of the above — depth → y, a running cursor → x, parents
 * centred horizontally over their children. Best for wide, shallow
 * documents (a config object with many top-level keys), which horizontal
 * layout stretches into one very tall column.
 */
function layoutVertical(root: BuildNode) {
  let cursorX = 0;
  const rowY: number[] = [];
  // Depth rows are as tall as the tallest node in them, so ranks stay tidy.
  const measure = (node: BuildNode, depth: number) => {
    rowY[depth] = Math.max(rowY[depth] ?? 0, node.height);
    for (const child of node.children) measure(child, depth + 1);
  };
  measure(root, 0);
  const rowTop: number[] = [];
  rowY.reduce((acc, h, i) => (rowTop[i] = acc, acc + h + V_GAP * 2), 0);

  const walk = (node: BuildNode, depth: number) => {
    node.y = rowTop[depth];
    if (node.children.length === 0) {
      node.x = cursorX;
      cursorX += node.width + H_GAP / 2;
      return;
    }
    for (const child of node.children) walk(child, depth + 1);
    const first = node.children[0];
    const last = node.children[node.children.length - 1];
    node.x = (first.x + last.x + last.width) / 2 - node.width / 2;
    cursorX = Math.max(cursorX, node.x + node.width + H_GAP / 2);
  };
  walk(root, 0);
}

/**
 * Radial: rank = ring, leaves spread evenly around the circle. Best for
 * judging the overall shape and balance of a document at a glance — which
 * branch is heavy, how deep it goes — rather than reading every value.
 *
 * Leaves are assigned angles first, then each parent takes the mean angle
 * of its children, which keeps subtrees in contiguous wedges.
 */
function layoutRadial(root: BuildNode) {
  const leaves: BuildNode[] = [];
  const collect = (n: BuildNode) => {
    if (n.children.length === 0) leaves.push(n);
    else n.children.forEach(collect);
  };
  collect(root);

  const angles = new Map<BuildNode, number>();
  const leafCount = Math.max(leaves.length, 1);
  leaves.forEach((leaf, i) => angles.set(leaf, (i / leafCount) * Math.PI * 2));

  const assign = (n: BuildNode): number => {
    if (n.children.length === 0) return angles.get(n)!;
    const mean = n.children.reduce((sum, c) => sum + assign(c), 0) / n.children.length;
    angles.set(n, mean);
    return mean;
  };
  assign(root);

  // Ring spacing: enough circumference for the leaves, but no more.
  // Radial doesn't need a full node-width between rings the way the
  // linear layouts do — nodes on the same ring sit at different angles,
  // so they separate tangentially rather than radially. Using the linear
  // gap here inflated a 7-node document to a 2,000px canvas, which fit()
  // then had to show at 35%.
  const ringGap = Math.max(180, (leafCount * (NODE_WIDTH * 0.42)) / (Math.PI * 2));
  const depthOf = (n: BuildNode, d = 0): number =>
    n.children.length === 0 ? d : Math.max(...n.children.map((c) => depthOf(c, d + 1)));
  const maxDepth = Math.max(depthOf(root), 1);
  const radius = ringGap * maxDepth;

  const walk = (n: BuildNode, depth: number) => {
    const a = angles.get(n)!;
    const r = (depth / maxDepth) * radius;
    // Offset by the canvas centre so all coordinates stay positive.
    n.x = radius + r * Math.cos(a) - n.width / 2;
    n.y = radius + r * Math.sin(a) - n.height / 2;
    n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);

  // Radial can place nodes at negative coords near the edge; normalise.
  let minX = Infinity;
  let minY = Infinity;
  const bounds = (n: BuildNode) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    n.children.forEach(bounds);
  };
  bounds(root);
  if (minX < 0 || minY < 0) {
    const shift = (n: BuildNode) => {
      n.x -= Math.min(0, minX);
      n.y -= Math.min(0, minY);
      n.children.forEach(shift);
    };
    shift(root);
  }
}

function runLayout(root: BuildNode, mode: GraphLayout) {
  if (mode === "vertical") return layoutVertical(root);
  if (mode === "radial") return layoutRadial(root);
  return layoutHorizontal(root);
}

/** Describe the field names of an array's object items, for a summary row. */
const shapeOf = (items: unknown[]): string[] => {
  const keys: string[] = [];
  for (const item of items.slice(0, 20)) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const k of Object.keys(item)) if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
};

export type BuildGraphOptions = {
  /** Hard ceiling on nodes. Hitting it LOSES data and sets `truncated`. */
  maxNodes?: number;
  /**
   * Above this many object/array children, an array folds into one summary
   * node instead of expanding. This is the main defence: a 200-item array
   * used to lay out 202 nodes across 33,000px of canvas, which `fit()`
   * could only show at the 15% zoom floor — an illegible hairline. Folding
   * keeps the diagram readable and, unlike `maxNodes`, loses nothing: the
   * count and item shape are shown, and the caller can expand on demand.
   */
  maxArrayChildren?: number;
  /** Paths the user explicitly expanded, exempt from `maxArrayChildren`. */
  expandedPaths?: string[];
  /** Arrangement on the canvas. Defaults to the original horizontal tree. */
  layout?: GraphLayout;
};

/** Build a laid-out graph model. Folds oversized arrays; caps total nodes. */
export function buildGraphModel(root: unknown, options: BuildGraphOptions | number = {}): GraphModel {
  // Back-compat: buildGraphModel(value, 600) used to mean maxNodes.
  const opts = typeof options === "number" ? { maxNodes: options } : options;
  const maxNodes = opts.maxNodes ?? 600;
  const maxArrayChildren = opts.maxArrayChildren ?? 25;
  const expanded = new Set(opts.expandedPaths ?? []);
  const layoutMode: GraphLayout = opts.layout ?? "horizontal";

  const nodes: BuildNode[] = [];
  const edges: GraphEdge[] = [];
  const collapsedPaths: string[] = [];
  let idCounter = 0;
  let truncated = false;
  let fullNodeCount = 0;

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
    fullNodeCount++;
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

    // Fold an oversized array into a summary node. Only arrays: a wide
    // object's keys are distinct fields worth seeing, whereas an array's
    // items are N repetitions of one shape, which a count plus that shape
    // describes far better than N identical boxes.
    const shouldFold =
      isArray && childSpecs.length > maxArrayChildren && !expanded.has(path);

    if (shouldFold) {
      const items = value as unknown[];
      const shape = shapeOf(items);
      // Keep the field list short: the node is only NODE_WIDTH wide and
      // the value is right-aligned, so a long join collides with its key.
      const shapeLabel =
        shape.length > 3 ? `${shape.slice(0, 3).join(", ")} +${shape.length - 3}` : shape.join(", ");
      const summaryRows: GraphRow[] = [
        { key: "items", value: String(items.length), type: "number" },
        ...(shape.length
          ? [{ key: "fields", value: formatValue(shapeLabel), type: "string" as GraphValueType }]
          : []),
      ];
      const node = makeNode(label, path, "array", [...rows, ...summaryRows]);
      node.collapsed = { total: childSpecs.length, shown: 0, shape };
      // Room for the renderer's "expand N items" control at the foot.
      node.height += COLLAPSE_CTA_H;
      collapsedPaths.push(path);
      // Count what we skipped so callers can report the true size.
      fullNodeCount += childSpecs.length;
      return node;
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

  if (rootNode) runLayout(rootNode, layoutMode);

  const width = nodes.reduce((max, n) => Math.max(max, n.x + n.width), 0);
  const height = nodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);

  return {
    nodes: nodes.map(({ children, ...rest }) => { void children; return rest; }),
    edges,
    width,
    height,
    truncated,
    collapsedPaths,
    fullNodeCount,
  };
}
