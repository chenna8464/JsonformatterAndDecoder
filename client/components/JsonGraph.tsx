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
  ChevronDown,
  Layers,
  AlertTriangle,
  LayoutList,
  LayoutPanelTop,
  CircleDot,
} from "lucide-react";
import { buildGraphModel, NODE_WIDTH, type GraphLayout, type GraphModel, type GraphNode, type GraphValueType } from "@/lib/graph";
import { toast } from "sonner";

type Props = {
  json: string;
  dark: boolean;
  onUpdateJson?: (newJson: string) => void;
  /** Switch the workspace to Table view — better for arrays of records. */
  onOpenTable?: () => void;
};

const HEADER_H = 32;
const ROW_H = 24;
/** Below this zoom the 11px node text stops being readable at all. */
const LEGIBLE_MIN_ZOOM = 0.35;

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

export default function JsonGraph({ json, dark, onUpdateJson, onOpenTable }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  /** Array paths the user chose to expand despite the fold threshold. */
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [layout, setLayout] = useState<GraphLayout>("horizontal");
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
      return buildGraphModel(JSON.parse(json), { expandedPaths, layout });
    } catch {
      return null;
    }
  }, [json, expandedPaths, layout]);

  /**
   * Fit the diagram, but never below LEGIBLE_MIN_ZOOM.
   *
   * The old version clamped to 0.15 and called it done, which is how a
   * 200-item array ended up rendered as an illegible 15% hairline. Below
   * the legibility floor we now fit to WIDTH and let the user scroll
   * vertically — twenty readable nodes beats two hundred unreadable ones.
   */
  const fit = () => {
    const el = containerRef.current;
    if (!el || !model || model.width === 0) return;
    const fitBoth = Math.min((el.clientWidth - 80) / model.width, (el.clientHeight - 80) / model.height, 1.2);
    const legible = fitBoth >= LEGIBLE_MIN_ZOOM;
    const scale = legible
      ? fitBoth
      : Math.min((el.clientWidth - 80) / model.width, 1.2);
    const z = Math.max(LEGIBLE_MIN_ZOOM, Number(scale.toFixed(2)));
    setZoom(z);
    setPan({
      x: Math.round((el.clientWidth - model.width * z) / 2),
      // When we couldn't fit vertically, start at the top rather than
      // centring on the middle of a very tall canvas.
      y: legible ? Math.round((el.clientHeight - model.height * z) / 2) : 40,
    });
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
      {/* ── Graph readout bar ──────────────────────────────────────
          Simplified to match the rest of the chrome. Was: a rounded-full
          zoom capsule with its own border and shadow, a bordered box
          around the selection, and a pill Export button — three
          different container shapes in one 40px strip. Now a single
          hairline row: tabular-mono readouts on the left, hairline-
          separated controls on the right, no capsules at all. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule)] bg-[var(--surface-soft)] px-4 py-2">
        {/* Truncation no longer whispers here — it has its own banner. */}
        <span className="tnum font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {model.nodes.length} <span className="text-[var(--rule-strong)]">node{model.nodes.length === 1 ? "" : "s"}</span>
          {model.collapsedPaths.length > 0 && (
            <span className="ml-1.5 text-[var(--brand)]">of {model.fullNodeCount.toLocaleString()}</span>
          )}
        </span>
        {/* Demoted to 2xl only: with the layout toggle in this row, the
            pan/zoom hint was the item pushing everything onto a second
            line, and it's the least valuable thing here — the behaviour
            is discoverable by trying it. */}
        <span className="hidden h-3 w-px bg-[var(--rule)] 2xl:block" />
        <span className="eyebrow hidden 2xl:block">Drag to pan · wheel to zoom</span>

        {/* Selection: the node path in mono, actions as plain verbs. */}
        {selectedNode && (
          <>
            <span className="h-3 w-px bg-[var(--rule)]" />
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] font-medium text-[var(--brand)]">{selectedNode.label}</span>
              {onUpdateJson && (
                <button
                  onClick={() => handleOpenAddModal(selectedNode)}
                  className="app-focus chrome flex items-center gap-1.5 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                >
                  <PlusCircle size={12} /> Add property
                </button>
              )}
              {selectedNode.path !== "$" && selectedNode.path !== "root" && onUpdateJson && (
                <button
                  onClick={() => handleDeleteNode(selectedNode)}
                  className="app-focus text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                  title="Delete this node from JSON"
                  aria-label="Delete node"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Layout modes ───────────────────────────────────────────
            Deliberately layouts, not a 2D/3D switch: all three keep text
            upright and axis-aligned, so reading keys and values — the
            actual job — never degrades. Each suits a different document
            shape, and all three still export to SVG/PNG. */}
        <div className="ml-auto flex items-center gap-1">
          {([
            { id: "horizontal", label: "Horizontal", icon: LayoutList, hint: "Best for deeply nested documents" },
            { id: "vertical", label: "Vertical", icon: LayoutPanelTop, hint: "Best for wide, shallow documents" },
            { id: "radial", label: "Radial", icon: CircleDot, hint: "Best for judging overall shape and balance" },
          ] as const).map((mode) => (
            <button
              key={mode.id}
              onClick={() => setLayout(mode.id)}
              className="app-focus chrome flex h-7 items-center gap-1.5 px-2 transition-colors"
              style={{
                borderRadius: "var(--r-edge)",
                color: layout === mode.id ? "var(--brand)" : "var(--chrome-ink)",
                background: layout === mode.id ? "var(--brand-soft)" : "transparent",
              }}
              title={`${mode.label} layout — ${mode.hint}`}
              aria-pressed={layout === mode.id}
            >
              <mode.icon size={13} strokeWidth={layout === mode.id ? 2.4 : 2} />
              <span className="hidden lg:inline">{mode.label}</span>
            </button>
          ))}
          <span className="mx-1.5 h-3.5 w-px bg-[var(--rule)]" />
          {/* Zoom: bare glyphs around a tabular readout. The percentage
              is the only thing with ink weight, because it's the data. */}
          <button
            onClick={() => setZoom((z) => Math.max(0.15, Number((z / 1.15).toFixed(2))))}
            className="app-focus p-1.5 text-slate-400 transition-colors hover:text-[var(--brand)]"
            style={{ borderRadius: "var(--r-edge)" }}
            title="Zoom out (-15%)"
            aria-label="Zoom out"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="app-focus tnum min-w-[42px] px-1 font-mono text-[11px] font-medium text-slate-600 transition-colors hover:text-[var(--brand)] dark:text-slate-300"
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, Number((z * 1.15).toFixed(2))))}
            className="app-focus p-1.5 text-slate-400 transition-colors hover:text-[var(--brand)]"
            style={{ borderRadius: "var(--r-edge)" }}
            title="Zoom in (+15%)"
            aria-label="Zoom in"
          >
            <Plus size={13} />
          </button>
          <span className="mx-1.5 h-3.5 w-px bg-[var(--rule)]" />
          <button
            onClick={fit}
            className="app-focus p-1.5 text-slate-400 transition-colors hover:text-[var(--brand)]"
            style={{ borderRadius: "var(--r-edge)" }}
            title="Fit graph to screen"
            aria-label="Fit graph to screen"
          >
            <Maximize size={13} />
          </button>
          <span className="mx-1.5 h-3.5 w-px bg-[var(--rule)]" />

          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((open) => !open)}
              className={`header-button ${exportMenuOpen ? "header-button-on" : ""}`}
              title="Export Graph Image"
            >
              <Download size={13} />
              <span>Export</span>
              <ChevronDown size={11} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {exportMenuOpen && (
              <div
                onClick={() => setExportMenuOpen(false)}
                className="menu-surface absolute right-0 top-10 z-50 w-48"
              >
                <button onClick={exportSvg} className="menu-item">
                  <Download size={14} className="text-[var(--brand)]" />
                  <span>SVG vector</span>
                  <span className="menu-hint">.svg</span>
                </button>
                <button onClick={exportPng} className="menu-item">
                  <ImageDown size={14} className="text-[var(--brand)]" />
                  <span>PNG image</span>
                  <span className="menu-hint">.png</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Folded-array notice ────────────────────────────────────
          States plainly what was folded and offers the two sensible
          exits: expand it anyway, or open the view that suits this shape
          better. Nothing is hidden silently. */}
      {model && model.collapsedPaths.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule)] bg-[var(--brand-soft)] px-4 py-2.5">
          <Layers size={14} className="shrink-0 text-[var(--brand)]" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--brand)]">
            <span className="font-semibold">
              {model.collapsedPaths.length === 1
                ? "1 large array is summarised"
                : `${model.collapsedPaths.length} large arrays are summarised`}
            </span>
            <span className="ml-1.5 text-slate-500 dark:text-slate-400">
              Repeated items are shown as a count and field list so the diagram stays readable.
            </span>
          </p>
          <button
            onClick={() => setExpandedPaths(model.collapsedPaths)}
            className="app-focus chrome shrink-0 border border-[var(--brand-border)] px-2.5 py-1 text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft-hover)]"
            style={{ borderRadius: "var(--r-edge)" }}
          >
            Expand all
          </button>
          {onOpenTable && (
            <button
              onClick={onOpenTable}
              className="app-focus chrome shrink-0 px-2 py-1 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
              style={{ borderRadius: "var(--r-edge)" }}
              title="Arrays of records read better as a table"
            >
              Open in Table
            </button>
          )}
        </div>
      )}

      {/* ── Truncation warning ─────────────────────────────────────
          Distinct from folding, and deliberately louder: folding is
          reversible and lossless, this is data that is NOT on screen.
          It used to be a small amber word in the toolbar, which read as
          a footnote rather than "you are not seeing your data". */}
      {model?.truncated && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Diagram incomplete.</span>
            <span className="ml-1.5">
              Showing {model.nodes.length.toLocaleString()} of ~{model.fullNodeCount.toLocaleString()} nodes — the
              rest are not drawn. Collapse arrays or inspect the document in Tree or Table view to see everything.
            </span>
          </p>
          {expandedPaths.length > 0 && (
            <button
              onClick={() => setExpandedPaths([])}
              className="app-focus chrome shrink-0 border border-amber-400/60 px-2.5 py-1 text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/20"
              style={{ borderRadius: "var(--r-edge)" }}
            >
              Re-collapse
            </button>
          )}
        </div>
      )}

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

                  {/* Folded array: an in-canvas expand control, so the
                      affordance sits on the thing it affects rather than
                      only in the banner at the top of the view. */}
                  {n.collapsed && (
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPaths((prev) =>
                          prev.includes(n.path) ? prev : [...prev, n.path]
                        );
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={n.x + 8}
                        y={n.y + n.height - 26}
                        width={n.width - 16}
                        height={20}
                        rx={3}
                        fill={p.selected}
                        opacity={0.12}
                      />
                      <text
                        x={n.x + n.width / 2}
                        y={n.y + n.height - 12}
                        fontSize={10}
                        fontWeight={600}
                        textAnchor="middle"
                        fill={p.selected}
                        fontFamily="ui-monospace, monospace"
                      >
                        {`EXPAND ${n.collapsed.total} ITEMS`}
                      </text>
                    </g>
                  )}
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
