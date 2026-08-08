import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageDown, Maximize, Minus, Plus } from "lucide-react";
import { buildGraphModel, NODE_WIDTH, type GraphModel, type GraphValueType } from "@/lib/graph";

type Props = { json: string; dark: boolean };

const HEADER_H = 30;
const ROW_H = 22;

type Palette = {
  bg: string;
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
    bg: "#f6f7fb",
    nodeFill: "#ffffff",
    nodeStroke: "#e3e6ef",
    headerFill: "#eef4f3",
    edge: "#c3ccd8",
    text: "#172033",
    key: "#0f766e",
    selected: "#0f766e",
    value: { string: "#15803d", number: "#dc2626", boolean: "#d97706", null: "#7c3aed" },
  },
  dark: {
    bg: "#0d1117",
    nodeFill: "#161b22",
    nodeStroke: "#2a2f3a",
    headerFill: "#14403b",
    edge: "#3a4150",
    text: "#e6e9f0",
    key: "#2dd4bf",
    selected: "#2dd4bf",
    value: { string: "#9ece6a", number: "#f7768e", boolean: "#e0af68", null: "#bb9af7" },
  },
};

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
};

/** Build a standalone SVG string for export (explicit colors, own background). */
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
    parts.push(`<path d="${edgePath(from.x + from.width, from.y + HEADER_H / 2, to.x, to.y + HEADER_H / 2)}" fill="none" stroke="${p.edge}" stroke-width="1.5"/>`);
  }
  for (const n of model.nodes) {
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="8" fill="${p.nodeFill}" stroke="${p.nodeStroke}" stroke-width="1.5"/>`);
    parts.push(`<path d="M ${n.x} ${n.y + 8} q 0 -8 8 -8 h ${n.width - 16} q 8 0 8 8 v ${HEADER_H - 8} h -${n.width} z" fill="${p.headerFill}"/>`);
    parts.push(`<text x="${n.x + 10}" y="${n.y + 20}" font-size="12" font-weight="700" fill="${p.key}">${escapeXml(n.label)}${n.kind === "array" ? " []" : n.kind === "object" ? " {}" : ""}</text>`);
    n.rows.forEach((row, i) => {
      const ry = n.y + HEADER_H + i * ROW_H + 15;
      parts.push(`<text x="${n.x + 10}" y="${ry}" font-size="11" fill="${p.text}">${escapeXml(row.key)}</text>`);
      parts.push(`<text x="${n.x + n.width - 10}" y="${ry}" font-size="11" text-anchor="end" fill="${p.value[row.type]}">${escapeXml(row.value)}</text>`);
    });
  }
  parts.push("</g></svg>");
  return parts.join("");
}

export default function JsonGraph({ json, dark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const p = palettes[dark ? "dark" : "light"];

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
    const z = Math.max(0.1, scale);
    setZoom(z);
    setPan({ x: (el.clientWidth - model.width * z) / 2, y: (el.clientHeight - model.height * z) / 2 });
  };

  // Fit whenever the document (and thus the model) changes.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(3, Math.max(0.08, zoom * factor));
    // Keep the point under the cursor fixed while zooming.
    setPan({ x: px - ((px - pan.x) / zoom) * newZoom, y: py - ((py - pan.y) / zoom) * newZoom });
    setZoom(newZoom);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + (event.clientX - drag.current.x), y: drag.current.panY + (event.clientY - drag.current.y) });
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
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };

  if (!model) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-6"><div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">Fix the JSON syntax (or hit Format) to view the graph.</div></div>;
  }

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2">
        <span className="text-xs font-semibold text-slate-400">{model.nodes.length} node{model.nodes.length === 1 ? "" : "s"}{model.truncated ? " (truncated — showing first 600)" : ""} · drag to pan, scroll to zoom</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm hover:text-[var(--brand)]" title="Zoom in" aria-label="Zoom in"><Plus size={14} /></button>
          <button onClick={() => setZoom((z) => Math.max(0.08, z / 1.2))} className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm hover:text-[var(--brand)]" title="Zoom out" aria-label="Zoom out"><Minus size={14} /></button>
          <button onClick={fit} className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm hover:text-[var(--brand)]" title="Fit to view" aria-label="Fit to view"><Maximize size={14} /></button>
          <button onClick={exportSvg} className="tool-button h-7 px-2 text-[11px]"><Download size={13} /> SVG</button>
          <button onClick={exportPng} className="tool-button h-7 px-2 text-[11px]"><ImageDown size={13} /> PNG</button>
        </div>
      </div>
      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        style={{ background: p.bg }}
      >
        <svg className="h-full w-full" style={{ display: "block" }}>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {model.edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              return <path key={`${e.from}-${e.to}`} d={edgePath(from.x + from.width, from.y + HEADER_H / 2, to.x, to.y + HEADER_H / 2)} fill="none" stroke={p.edge} strokeWidth={1.5} />;
            })}
            {model.nodes.map((n) => {
              const isSel = selected === n.id;
              return (
                <g key={n.id} onPointerDown={(event) => { event.stopPropagation(); setSelected(n.id); }} style={{ cursor: "pointer" }}>
                  <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={8} fill={p.nodeFill} stroke={isSel ? p.selected : p.nodeStroke} strokeWidth={isSel ? 2.5 : 1.5} />
                  <path d={`M ${n.x} ${n.y + 8} q 0 -8 8 -8 h ${n.width - 16} q 8 0 8 8 v ${HEADER_H - 8} h -${n.width} z`} fill={p.headerFill} />
                  <text x={n.x + 10} y={n.y + 20} fontSize={12} fontWeight={700} fill={p.key} fontFamily="ui-monospace, monospace">{n.label}{n.kind === "array" ? " []" : n.kind === "object" ? " {}" : ""}</text>
                  {n.rows.map((row, i) => {
                    const ry = n.y + HEADER_H + i * ROW_H + 15;
                    return (
                      <g key={i}>
                        <text x={n.x + 10} y={ry} fontSize={11} fill={p.text} fontFamily="ui-monospace, monospace">{row.key.length > 16 ? row.key.slice(0, 15) + "…" : row.key}</text>
                        <text x={n.x + n.width - 10} y={ry} fontSize={11} textAnchor="end" fill={p.value[row.type]} fontFamily="ui-monospace, monospace">{row.value}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
