import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ImageDown,
  Maximize,
  Minus,
  Plus,
  PlusCircle,
  Trash2,
  Copy,
  RotateCcw,
  X,
  Check,
  Sparkles,
} from "lucide-react";
import { buildGraphModel, NODE_WIDTH, type GraphModel, type GraphNode, type GraphValueType } from "@/lib/graph";
import { toast } from "sonner";

type Props = {
  json: string;
  dark: boolean;
  onUpdateJson?: (newJson: string) => void;
};

const HEADER_H = 32;
const ROW_H = 24;

type Palette = {
  bg: string;
  gridDot: string;
  nodeFill: string;
  nodeStroke: string;
  headerFill: string;
  edge: string;
  text: string;
  key: string;
  selected: string;
  value: Record<GraphValueType, string>;
};

const palettes: Record<"light" | "dark", Palette> = {
  light: {
    bg: "#f8fafc",
    gridDot: "rgba(100, 116, 139, 0.15)",
    nodeFill: "#ffffff",
    nodeStroke: "#e2e8f0",
    headerFill: "#f1f5f9",
    edge: "#94a3b8",
    text: "#1e293b",
    key: "#0f766e",
    selected: "#0f766e",
    value: { string: "#16a34a", number: "#dc2626", boolean: "#d97706", null: "#9333ea" },
  },
  dark: {
    bg: "#0d1117",
    gridDot: "rgba(255, 255, 255, 0.1)",
    nodeFill: "#161b22",
    nodeStroke: "#30363d",
    headerFill: "#1f242c",
    edge: "#484f58",
    text: "#e6e9f0",
    key: "#2dd4bf",
    selected: "#2dd4bf",
    value: { string: "#4ade80", number: "#f87171", boolean: "#fbbf24", null: "#c084fc" },
  },
};

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
};

/** Parse a graph node path (e.g. "$.project" or "$.endpoints[0]") into JSON path segments. */
function parsePathSegments(path: string): (string | number)[] {
  if (!path || path === "$" || path === "root") return [];
  const clean = path.replace(/^\$\.?/, "").replace(/^root\.?/, "");
  if (!clean) return [];

  const segments: (string | number)[] = [];
  const parts = clean.split(".");

  for (const part of parts) {
    if (!part) continue;
    const arrayMatch = part.match(/^([^\[]+)?\[(\d+)\]$/);
    if (arrayMatch) {
      if (arrayMatch[1]) segments.push(arrayMatch[1]);
      segments.push(parseInt(arrayMatch[2], 10));
    } else {
      segments.push(part);
    }
  }
  return segments;
}

/** Standalone SVG renderer for export. */
function renderSvgString(model: GraphModel, p: Palette): string {
  const pad = 40;
  const w = model.width + pad * 2;
  const h = model.height + pad * 2;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-monospace, monospace">`,
    `<rect width="${w}" height="${h}" fill="${p.bg}"/>`,
    `<g transform="translate(${pad} ${pad})">`,
  ];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  for (const e of model.edges) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) continue;
    parts.push(
      `<path d="${edgePath(from.x + from.width, from.y + HEADER_H / 2, to.x, to.y + HEADER_H / 2)}" fill="none" stroke="${p.edge}" stroke-width="1.5"/>`
    );
  }
  for (const n of model.nodes) {
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="${p.nodeFill}" stroke="${p.nodeStroke}" stroke-width="1.5"/>`
    );
    parts.push(
      `<path d="M ${n.x} ${n.y + 8} q 0 -8 8 -8 h ${n.width - 16} q 8 0 8 8 v ${HEADER_H - 8} h -${n.width} z" fill="${p.headerFill}"/>`
    );
    parts.push(
      `<text x="${n.x + 10}" y="${n.y + 21}" font-size="12" font-weight="700" fill="${p.key}">${escapeXml(n.label)}${n.kind === "array" ? " []" : n.kind === "object" ? " {}" : ""}</text>`
    );
    n.rows.forEach((row, i) => {
      const ry = n.y + HEADER_H + i * ROW_H + 16;
      parts.push(`<text x="${n.x + 10}" y="${ry}" font-size="11" fill="${p.text}">${escapeXml(row.key)}</text>`);
      parts.push(
        `<text x="${n.x + n.width - 10}" y="${ry}" font-size="11" text-anchor="end" fill="${p.value[row.type]}">${escapeXml(row.value)}</text>`
      );
    });
  }
  parts.push("</g></svg>");
  return parts.join("");
}

export default function JsonGraph({ json, dark, onUpdateJson }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const p = palettes[dark ? "dark" : "light"];

  // Add Node Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [targetNode, setTargetNode] = useState<GraphNode | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValueType, setNewValueType] = useState<"string" | "number" | "boolean" | "object" | "array" | "null">("string");
  const [newValueInput, setNewValueInput] = useState("");

  const model = useMemo(() => {
    try {
      return buildGraphModel(JSON.parse(json));
    } catch {
      return null;
    }
  }, [json]);

  const fit = () => {
    const el = containerRef.current;
    if (!el || !model || model.width === 0) return;
    const scale = Math.min((el.clientWidth - 80) / model.width, (el.clientHeight - 80) / model.height, 1.2);
    const z = Math.max(0.15, Number(scale.toFixed(2)));
    setZoom(z);
    setPan({ x: Math.round((el.clientWidth - model.width * z) / 2), y: Math.round((el.clientHeight - model.height * z) / 2) });
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Controlled, tactile wheel zoom
  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    const delta = -Math.sign(event.deltaY);
    const factor = delta > 0 ? 1.08 : 0.92;
    const newZoom = Math.min(2.5, Math.max(0.15, Number((zoom * factor).toFixed(2))));

    setPan({
      x: Math.round(px - ((px - pan.x) / zoom) * newZoom),
      y: Math.round(py - ((py - pan.y) / zoom) * newZoom),
    });
    setZoom(newZoom);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + (event.clientX - drag.current.x),
      y: drag.current.panY + (event.clientY - drag.current.y),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = () => {
    if (!model) return;
    download(new Blob([renderSvgString(model, p)], { type: "image/svg+xml" }), "json-graph.svg");
    toast.success("Exported graph as SVG");
  };

  const exportPng = () => {
    if (!model) return;
    const svg = renderSvgString(model, p);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => blob && download(blob, "json-graph.png"), "image/png");
      toast.success("Exported graph as PNG");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };

  // Open modal to add property to a graph node
  const handleOpenAddModal = (node: GraphNode) => {
    setTargetNode(node);
    setNewKey("");
    setNewValueType("string");
    setNewValueInput("");
    setAddModalOpen(true);
  };

  // Submit adding a new property/element to the target node
  const handleAddPropertySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetNode || !onUpdateJson) return;

    try {
      const parsed = JSON.parse(json);
      const segments = parsePathSegments(targetNode.path);

      // Determine new value based on type
      let parsedValue: unknown = newValueInput;
      if (newValueType === "number") parsedValue = Number(newValueInput) || 0;
      else if (newValueType === "boolean") parsedValue = newValueInput === "true";
      else if (newValueType === "null") parsedValue = null;
      else if (newValueType === "object") parsedValue = {};
      else if (newValueType === "array") parsedValue = [];

      // Navigate to target container in parsed JSON
      let container: any = parsed;
      for (const seg of segments) {
        if (container && typeof container === "object") {
          container = container[seg];
        }
      }

      if (Array.isArray(container)) {
        container.push(parsedValue);
        toast.success(`Added new element to ${targetNode.label || "array"}`);
      } else if (container !== null && typeof container === "object") {
        const keyToAdd = newKey.trim() || `prop_${Date.now().toString().slice(-4)}`;
        container[keyToAdd] = parsedValue;
        toast.success(`Added property "${keyToAdd}" to ${targetNode.label || "node"}`);
      } else {
        toast.error("Could not add property: Target node is not an object or array.");
        return;
      }

      onUpdateJson(JSON.stringify(parsed, null, 2));
      setAddModalOpen(false);
    } catch (err) {
      toast.error("Could not update JSON", { description: err instanceof Error ? err.message : "Syntax error" });
    }
  };

  // Delete node or property
  const handleDeleteNode = (node: GraphNode) => {
    if (!onUpdateJson || node.path === "$" || node.path === "root") {
      toast.error("Root node cannot be deleted.");
      return;
    }

    try {
      const parsed = JSON.parse(json);
      const segments = parsePathSegments(node.path);
      if (segments.length === 0) return;

      const parentSegments = segments.slice(0, -1);
      const targetKey = segments[segments.length - 1];

      let parentObj: any = parsed;
      for (const seg of parentSegments) {
        if (parentObj && typeof parentObj === "object") {
          parentObj = parentObj[seg];
        }
      }

      if (Array.isArray(parentObj) && typeof targetKey === "number") {
        parentObj.splice(targetKey, 1);
      } else if (parentObj && typeof parentObj === "object") {
        delete parentObj[targetKey];
      }

      onUpdateJson(JSON.stringify(parsed, null, 2));
      setSelectedNodeId(null);
      toast.success(`Deleted node "${node.label}" from JSON`);
    } catch (err) {
      toast.error("Could not delete node from JSON");
    }
  };

  if (!model) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-400">
          Fix the JSON syntax (or hit Format) to view the interactive graph.
        </div>
      </div>
    );
  }

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Graph Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {model.nodes.length} node{model.nodes.length === 1 ? "" : "s"}
          {model.truncated ? " (truncated — showing first 600)" : ""} · drag to pan, wheel to zoom
        </span>

        {/* Selected Node Action Bar */}
        {selectedNode && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1 text-xs dark:bg-[var(--surface)]">
            <span className="font-bold text-[var(--brand)]">{selectedNode.label}</span>
            {onUpdateJson && (
              <button
                onClick={() => handleOpenAddModal(selectedNode)}
                className="flex items-center gap-1 text-[var(--brand)] hover:underline"
              >
                <PlusCircle size={13} /> Add property
              </button>
            )}
            {selectedNode.path !== "$" && selectedNode.path !== "root" && onUpdateJson && (
              <button
                onClick={() => handleDeleteNode(selectedNode)}
                className="ml-1 text-rose-600 hover:underline dark:text-rose-400"
                title="Delete this node from JSON"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="rounded-md bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-600 shadow-sm dark:bg-[#161b22] dark:text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.15, Number((z / 1.15).toFixed(2))))}
            className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm transition hover:text-[var(--brand)] dark:bg-[#161b22] dark:text-slate-300"
            title="Zoom out (-15%)"
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, Number((z * 1.15).toFixed(2))))}
            className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm transition hover:text-[var(--brand)] dark:bg-[#161b22] dark:text-slate-300"
            title="Zoom in (+15%)"
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500 shadow-sm transition hover:text-[var(--brand)] dark:bg-[#161b22] dark:text-slate-300"
            title="Reset to 100%"
          >
            100%
          </button>
          <button
            onClick={fit}
            className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm transition hover:text-[var(--brand)] dark:bg-[#161b22] dark:text-slate-300"
            title="Fit to screen"
            aria-label="Fit to screen"
          >
            <Maximize size={14} />
          </button>
          <button onClick={exportSvg} className="tool-button h-7 px-2 text-[11px]">
            <Download size={13} /> SVG
          </button>
          <button onClick={exportPng} className="tool-button h-7 px-2 text-[11px]">
            <ImageDown size={13} /> PNG
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas with Dot Grid Background */}
      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        style={{
          backgroundColor: p.bg,
          backgroundImage: dark
            ? "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)"
            : "radial-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <svg className="h-full w-full" style={{ display: "block" }}>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            {model.edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={edgePath(from.x + from.width, from.y + HEADER_H / 2, to.x, to.y + HEADER_H / 2)}
                  fill="none"
                  stroke={p.edge}
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Nodes */}
            {model.nodes.map((n) => {
              const isSel = selectedNodeId === n.id;
              return (
                <g
                  key={n.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedNodeId(n.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.width}
                    height={n.height}
                    rx={8}
                    fill={p.nodeFill}
                    stroke={isSel ? p.selected : p.nodeStroke}
                    strokeWidth={isSel ? 2.5 : 1.5}
                  />
                  <path
                    d={`M ${n.x} ${n.y + 8} q 0 -8 8 -8 h ${n.width - 16} q 8 0 8 8 v ${HEADER_H - 8} h -${n.width} z`}
                    fill={p.headerFill}
                  />
                  <text
                    x={n.x + 10}
                    y={n.y + 21}
                    fontSize={12}
                    fontWeight={700}
                    fill={p.key}
                    fontFamily="ui-monospace, monospace"
                  >
                    {n.label}
                    {n.kind === "array" ? " []" : n.kind === "object" ? " {}" : ""}
                  </text>

                  {/* Add Property Button in Node Header */}
                  {onUpdateJson && (
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAddModal(n);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <circle cx={n.x + n.width - 16} cy={n.y + 16} r={10} fill={p.selected} opacity={0.15} />
                      <text
                        x={n.x + n.width - 16}
                        y={n.y + 20}
                        fontSize={14}
                        fontWeight={800}
                        textAnchor="middle"
                        fill={p.selected}
                      >
                        ＋
                      </text>
                    </g>
                  )}

                  {/* Key-Value Rows */}
                  {n.rows.map((row, i) => {
                    const ry = n.y + HEADER_H + i * ROW_H + 16;
                    return (
                      <g key={i}>
                        <text
                          x={n.x + 10}
                          y={ry}
                          fontSize={11}
                          fill={p.text}
                          fontFamily="ui-monospace, monospace"
                        >
                          {row.key.length > 16 ? row.key.slice(0, 15) + "…" : row.key}
                        </text>
                        <text
                          x={n.x + n.width - 10}
                          y={ry}
                          fontSize={11}
                          textAnchor="end"
                          fill={p.value[row.type]}
                          fontFamily="ui-monospace, monospace"
                        >
                          {row.value}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Add Property / Node Modal */}
      {addModalOpen && targetNode && (
        <div
          onClick={() => setAddModalOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                <PlusCircle size={18} className="text-[var(--brand)]" /> Add Property to Node
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Target Node: <span className="font-mono font-bold text-[var(--brand)]">{targetNode.label}</span> ({targetNode.path || "$"})
            </p>

            <form onSubmit={handleAddPropertySubmit} className="mt-4 space-y-3.5">
              {targetNode.kind !== "array" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Property Key / Name *</label>
                  <input
                    type="text"
                    required
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. status, apiKey, retries"
                    className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Value Type</label>
                <select
                  value={newValueType}
                  onChange={(e) => setNewValueType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean (true / false)</option>
                  <option value="object">Nested Object ({})</option>
                  <option value="array">Array ([])</option>
                  <option value="null">Null</option>
                </select>
              </div>

              {newValueType !== "object" && newValueType !== "array" && newValueType !== "null" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Value</label>
                  {newValueType === "boolean" ? (
                    <select
                      value={newValueInput || "true"}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={newValueType === "number" ? "number" : "text"}
                      value={newValueInput}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      placeholder={newValueType === "number" ? "e.g. 100" : "e.g. active"}
                      className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                    />
                  )}
                </div>
              )}

              <div className="mt-5 flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="tool-button flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                >
                  <Check size={14} /> Add Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
