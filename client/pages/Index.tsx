import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Braces,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  GitCompare,
  Copy,
  Download,
  FileJson2,
  FilePlus2,
  FolderOpen,
  Maximize2,
  Minimize2,
  Upload,
  FileSpreadsheet,
  TerminalSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
  Table as TableIcon,
  ShieldCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Share2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";

const initialJson = `{
  "project": {
    "name": "Northstar API",
    "version": "2.4.0",
    "environment": "production"
  },
  "endpoints": [
    {
      "name": "Get user profile",
      "method": "GET",
      "path": "/api/v1/users/:id",
      "auth": true
    },
    {
      "name": "Update user profile",
      "method": "PATCH",
      "path": "/api/v1/users/:id",
      "auth": true
    }
  ],
  "settings": {
    "rateLimit": 100,
    "logging": true,
    "features": ["analytics", "webhooks"]
  }
}`;

const webhookJson = `{
  "event": "user.updated",
  "timestamp": "2024-05-18T10:30:00Z",
  "data": {
    "id": "usr_1024",
    "email": "hello@example.com",
    "active": true
  }
}`;

type Note = { id: number; title: string; text: string; path: string; line: number; mention: string; color: string };
type DocumentRecord = { name: string; content: string; updated: string };
type Workspace = { id: number; name: string; type: "Personal" | "Team"; color: string };

import { repairJson } from "@/lib/jsonRepair";
import { buildComparisonReport, diffLines, lineStatusMaps, valueDiffs, type LineStatus } from "@/lib/diff";
import { buildShareLink, copyText, downloadFile, readShareLink } from "@/lib/share";
import { csvToJson, jsonToCsv, queryJson, setAtPath } from "@/lib/convert";
import { toast } from "sonner";
import { validateAgainstSchema, type SchemaIssue } from "@/lib/schema";
import { arrayObjectFields, sortJsonValue, type SortDirection } from "@/lib/sort";
import JsonCodeEditor, { type JsonCodeEditorHandle } from "@/components/JsonCodeEditor";

type JsonTreeProps = {
  label: string;
  value: unknown;
  depth?: number;
  path?: (string | number)[];
  onEdit?: (path: (string | number)[], newValue: unknown) => void;
  openDepth?: number;
};

function JsonTree({ label, value, depth = 0, path = [], onEdit, openDepth = 2 }: JsonTreeProps) {
  const [open, setOpen] = useState(depth < openDepth);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isBranch = value !== null && typeof value === "object";
  const entries = isBranch ? Object.entries(value as Record<string, unknown>) : [];
  const preview = Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`;

  const commit = () => {
    setEditing(false);
    if (!onEdit) return;
    const raw = draft.trim();
    if (raw === JSON.stringify(value) || raw === "") return;
    try {
      onEdit(path, JSON.parse(raw));
    } catch {
      // Not valid JSON — treat the input as a plain string.
      onEdit(path, raw.replace(/^"|"$/g, ""));
    }
  };

  if (!isBranch) {
    return (
      <div className="group flex items-center gap-2 py-1.5 font-mono text-xs" style={{ paddingLeft: depth * 20 }}>
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="text-slate-300">:</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            className="min-w-[120px] rounded border border-[#9ed3c8] bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none"
          />
        ) : (
          <>
            {typeof value === "string" && /^https?:\/\/\S+$/i.test(value) ? (
              <a href={value} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800" title="Open link in a new tab">"{value}"</a>
            ) : (
              <button
                onClick={() => { if (onEdit) { setDraft(JSON.stringify(value)); setEditing(true); } }}
                className={`rounded px-0.5 text-left ${typeof value === "string" ? "text-amber-600" : typeof value === "boolean" ? "text-violet-600" : "text-sky-600"} ${onEdit ? "cursor-text hover:bg-[#e6f7f4] hover:outline hover:outline-1 hover:outline-[#9ed3c8]" : ""}`}
                title={onEdit ? "Click to edit value" : undefined}
              >
                {JSON.stringify(value)}
              </button>
            )}

            {onEdit && <button onClick={() => { setDraft(JSON.stringify(value)); setEditing(true); }} className="hidden text-slate-300 hover:text-[#0f766e] group-hover:block" aria-label="Edit value"><Pencil size={11} /></button>}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen((current) => !current)} className="flex items-center gap-1.5 py-1.5 text-left font-mono text-xs font-semibold text-slate-700 hover:text-[#0f766e]" style={{ paddingLeft: depth * 20 }}>
        <ChevronDown size={13} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        <span>{label}</span>
        <span className="font-normal text-slate-400">{preview}</span>
      </button>
      {open && <div>{entries.map(([key, child]) => <JsonTree key={`${label}-${key}`} label={Array.isArray(value) ? `[${key}]` : key} value={child} depth={depth + 1} path={[...path, Array.isArray(value) ? Number(key) : key]} onEdit={onEdit} openDepth={openDepth} />)}</div>}
    </div>
  );
}

const statusStyles: Record<LineStatus, string> = {
  same: "",
  changed: "bg-amber-100/80",
  removed: "bg-rose-100/90",
  added: "bg-emerald-100/90",
};

type DiffPaneProps = {
  value: string;
  onChange: (value: string) => void;
  statuses: Map<number, LineStatus>;
  editorRef: RefObject<HTMLTextAreaElement>;
  ariaLabel: string;
};

/** Editable textarea with a synced backdrop that paints diff colors per line. */
function DiffPane({ value, onChange, statuses, editorRef, ariaLabel }: DiffPaneProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const lines = value.split("\n");
  const syncScroll = () => {
    const editor = editorRef.current;
    const backdrop = backdropRef.current;
    if (!editor || !backdrop) return;
    backdrop.scrollTop = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
  };
  return (
    <div className="relative min-h-[280px] flex-1 overflow-hidden bg-white">
      {/* Backdrop paints the visible text + diff colors; the textarea on top is
          transparent (caret/selection only) so the two never double-render. */}
      <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="min-w-max p-4 font-mono text-xs leading-6 text-slate-700">
          {lines.map((line, index) => (
            <div key={index} className={`h-6 whitespace-pre ${statusStyles[statuses.get(index + 1) ?? "same"]}`}>
              {line || " "}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={editorRef}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        wrap="off"
        className="absolute inset-0 h-full w-full resize-none whitespace-pre bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-slate-700 outline-none selection:bg-[#b5e3db] selection:text-transparent"
      />
    </div>
  );
}


const previewValue = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) ?? "undefined";
  return text.length > 1200 ? `${text.slice(0, 1200)}\n… (${(text.length - 1200).toLocaleString()} more characters — use Copy result for the full value)` : text;
};

type PaneMode = "editor" | "tree" | "query";

type ComparePaneProps = {
  value: string;
  onChange: (value: string) => void;
  statuses: Map<number, LineStatus>;
  editorRef: RefObject<HTMLTextAreaElement>;
  ariaLabel: string;
};

/** One side of the compare view: a full mini-workspace with text / tree / query modes. */
function ComparePane({ value, onChange, statuses, editorRef, ariaLabel }: ComparePaneProps) {
  const [mode, setMode] = useState<PaneMode>("editor");
  const [queryText, setQueryText] = useState("");
  const [limit, setLimit] = useState(50);
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(value) as unknown, error: false };
    } catch {
      return { value: null, error: true };
    }
  }, [value]);
  const matches = useMemo(() => {
    if (mode !== "query" || parsed.error) return [];
    try {
      return queryJson(parsed.value, queryText);
    } catch {
      return [];
    }
  }, [mode, parsed, queryText]);
  useEffect(() => setLimit(50), [queryText, value]);

  const handleTreeEdit = (path: (string | number)[], newValue: unknown) => {
    onChange(JSON.stringify(setAtPath(parsed.value, path, newValue), null, 2));
    toast.success("Value updated");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-[#edf0f4] bg-[#fafbfc] px-2 py-1.5">
        {(["editor", "tree", "query"] as PaneMode[]).map((item) => (
          <button key={item} onClick={() => setMode(item)} className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize transition ${mode === item ? "bg-[#0f766e] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-[#0f766e]"}`}>
            {item === "editor" ? "Text" : item}
          </button>
        ))}
        <span className="ml-auto pr-2 text-[10px] font-semibold text-slate-400">{statuses.size > 0 ? `${statuses.size} lines differ` : "in sync"}</span>
      </div>
      {mode === "editor" && <DiffPane value={value} onChange={onChange} statuses={statuses} editorRef={editorRef} ariaLabel={ariaLabel} />}
      {mode === "tree" && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {parsed.error ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">Fix the JSON syntax (or hit Format) to view the tree.</div>
          ) : (
            <JsonTree label="root" value={parsed.value} onEdit={handleTreeEdit} />
          )}
        </div>
      )}
      {mode === "query" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[#edf0f4] p-2.5">
            <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="e.g. items[?price>100].name — dot paths, [index], [*], filters" spellCheck={false} className="w-full rounded-lg border border-[#e3e6ef] bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-[#9ed3c8]" />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-[#fafbfc] p-2.5">
            {parsed.error && <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">Fix the JSON syntax to query this document.</div>}
            {!parsed.error && matches.slice(0, limit).map((match) => (
              <div key={match.path} className="rounded-lg border border-[#ebeaf2] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="break-all font-mono text-[10px] font-bold text-[#0f766e]">{match.path}</p>
                  <button onClick={async () => { if (await copyText(JSON.stringify(match.value, null, 2))) toast.success("Copied"); }} className="shrink-0 rounded p-1 text-slate-300 transition hover:text-[#0f766e]" aria-label="Copy this value"><Copy size={12} /></button>
                </div>
                {typeof match.value === "string" && /^https?:\/\/\S+$/i.test(match.value) ? (
                  <a href={match.value} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-mono text-[11px] leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{match.value}</a>
                ) : (
                  <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] leading-5 text-slate-600">{previewValue(match.value)}</pre>
                )}
              </div>
            ))}
            {!parsed.error && matches.length > limit && <button onClick={() => setLimit((current) => current + 100)} className="w-full rounded-lg border border-dashed border-[#9ed3c8] py-2 text-xs font-bold text-[#0f766e] transition hover:bg-[#f4fbfa]">Show 100 more ({(matches.length - limit).toLocaleString()} left)</button>}
            {!parsed.error && matches.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{queryText.trim() ? "No matches." : "Type a query to filter this document."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}


type TableCandidate = { key: string; path: (string | number)[]; rows: Record<string, unknown>[] };

/** Find array-of-objects candidates in a parsed document: the root itself, or any top-level field. */
function findTableCandidates(root: unknown): TableCandidate[] {
  const isRowArray = (value: unknown): value is Record<string, unknown>[] =>
    Array.isArray(value) && value.length > 0 && value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));

  const candidates: TableCandidate[] = [];
  if (isRowArray(root)) candidates.push({ key: "root", path: [], rows: root });
  if (root !== null && typeof root === "object" && !Array.isArray(root)) {
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      if (isRowArray(value)) candidates.push({ key, path: [key], rows: value });
    }
  }
  return candidates;
}

type TableViewProps = {
  json: string;
  onChange: (value: string) => void;
};

/** Spreadsheet-style view for arrays of objects — sortable columns, editable cells. */
function TableView({ json, onChange }: TableViewProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sort, setSort] = useState<{ field: string; direction: SortDirection } | null>(null);

  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(json) as unknown, error: false };
    } catch {
      return { value: null, error: true };
    }
  }, [json]);

  const candidates = useMemo(() => (parsed.error ? [] : findTableCandidates(parsed.value)), [parsed]);
  const candidate = candidates.find((c) => c.key === selectedKey) ?? candidates[0];
  const columns = useMemo(() => (candidate ? arrayObjectFields(candidate.rows) : []), [candidate]);

  const commitRows = (nextRows: unknown) => {
    if (!candidate) return;
    onChange(JSON.stringify(setAtPath(parsed.value, candidate.path, nextRows), null, 2));
  };

  const toggleSort = (field: string) => {
    if (!candidate) return;
    const direction: SortDirection = sort?.field === field && sort.direction === "asc" ? "desc" : "asc";
    setSort({ field, direction });
    commitRows(sortJsonValue(candidate.rows, direction, field));
  };

  const editCell = (rowIndex: number, column: string, raw: string) => {
    if (!candidate) return;
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // keep as plain string
    }
    commitRows(setAtPath(candidate.rows, [rowIndex, column], value));
  };

  if (parsed.error) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-6"><div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">Fix the JSON syntax (or hit Format) to view it as a table.</div></div>;
  }

  if (!candidate) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-6"><div className="max-w-sm rounded-xl border border-[#e3e6ef] bg-[#fafbfc] p-5 text-center text-sm text-slate-500"><TableIcon size={22} className="mx-auto mb-2 text-[#0f766e]" />Table view works with an array of objects. This document doesn't have one at the root or in a top-level field — try Tree or Query instead.</div></div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f4] bg-[#fafbfc] px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><TableIcon size={15} className="text-[#0f766e]" /> {candidate.rows.length} row{candidate.rows.length === 1 ? "" : "s"} <span className="hidden sm:inline">• click a column header to sort, click a cell to edit • scroll right for more columns</span></div>
        {candidates.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Array:</span>
            {candidates.map((c) => (
              <button key={c.key} onClick={() => setSelectedKey(c.key)} title={`View "${c.key}" as a table`} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold transition ${candidate.key === c.key ? "bg-[#0f766e] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[#0f766e]"}`}><TableIcon size={12} />{c.key}</button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <table key={candidate.key} className="border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f7f8fb]">
            <tr>
              {columns.map((column) => (
                <th key={column} onClick={() => toggleSort(column)} className="cursor-pointer whitespace-nowrap border-b border-r border-[#eef0f5] px-3 py-2 font-mono font-bold text-slate-600 hover:bg-[#eef4f3]">
                  <span className="flex items-center gap-1">{column}{sort?.field === column ? (sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="text-slate-300" />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidate.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[#fafbfc]">
                {columns.map((column) => {
                  const cellValue = row[column];
                  const isUrl = typeof cellValue === "string" && /^https?:\/\/\S+$/i.test(cellValue);
                  return (
                    <td key={column} className="border-b border-r border-[#f1f3f9] px-3 py-1.5 font-mono">
                      {isUrl ? (
                        <a href={cellValue as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{cellValue as string}</a>
                      ) : (
                        <input
                          defaultValue={cellValue === undefined ? "" : JSON.stringify(cellValue)}
                          onBlur={(event) => { if (event.target.value !== JSON.stringify(cellValue)) editCell(rowIndex, column, event.target.value); }}
                          className={`w-full min-w-[80px] bg-transparent outline-none focus:bg-[#f4fbfa] ${typeof cellValue === "string" ? "text-amber-700" : typeof cellValue === "boolean" ? "text-violet-600" : typeof cellValue === "number" ? "text-sky-600" : "text-slate-400"}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const starterWorkspaces: Workspace[] = [
  { id: 1, name: "Personal Office", type: "Personal", color: "bg-[#0f766e]" },
  { id: 2, name: "API Guild", type: "Team", color: "bg-[#7c5ce3]" },
];

const starterDocuments: DocumentRecord[] = [
  { name: "northstar-api.json", content: initialJson, updated: "Just now" },
  { name: "webhook-payload.json", content: webhookJson, updated: "Yesterday" },
];

const starterNotes: Note[] = [
  {
    id: 1,
    title: "Confirm production limits",
    text: "Check whether this needs to be raised before the partner launch.",
    path: "settings.rateLimit",
    line: 20,
    mention: "",
    color: "bg-amber-400",
  },
  {
    id: 2,
    title: "API versioning",
    text: "Consider a v2 route before we add bulk updates here.",
    path: "endpoints[1]",
    line: 14,
    mention: "",
    color: "bg-violet-400",
  },
];

export default function Index() {
  const [json, setJson] = useState(initialJson);
  const [status, setStatus] = useState<"valid" | "invalid">("valid");
  const [notes, setNotes] = useState<Note[]>(starterNotes);
  const [noteText, setNoteText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteMention, setNoteMention] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [formatMessage, setFormatMessage] = useState("");
  const [commentLine, setCommentLine] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const [view, setView] = useState<"editor" | "tree" | "query" | "table">("editor");
  const [fullscreen, setFullscreen] = useState(false);
  const [queryText, setQueryText] = useState("endpoints[*].name");
  const [queryLimit, setQueryLimit] = useState(50);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortTargetKey, setSortTargetKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState("");
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('{\n  "type": "object",\n  "required": [],\n  "properties": {}\n}');
  const [schemaIssues, setSchemaIssues] = useState<SchemaIssue[] | null>(null);
  const [schemaError, setSchemaError] = useState("");
  const [treeDepth, setTreeDepth] = useState(2);
  const [leftWidth, setLeftWidth] = useState(232);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const dragState = useRef<{ side: "left" | "right"; startX: number; startWidth: number; otherWidth: number } | null>(null);
  const MIN_CENTER_WIDTH = 420;
  const LEFT_MIN = 248;
  const LEFT_MAX = 320;
  const RIGHT_MIN = 300;
  const RIGHT_MAX = 400;

  const startDrag = (side: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? leftWidth : rightWidth,
      otherWidth: side === "left" ? (rightCollapsed ? 0 : rightWidth) : (leftCollapsed ? 0 : leftWidth),
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    if (drag.side === "left") {
      const maxForCenter = Math.max(LEFT_MIN, window.innerWidth - drag.otherWidth - MIN_CENTER_WIDTH);
      setLeftWidth(Math.min(LEFT_MAX, maxForCenter, Math.max(LEFT_MIN, drag.startWidth + delta)));
    } else {
      const maxForCenter = Math.max(RIGHT_MIN, window.innerWidth - drag.otherWidth - MIN_CENTER_WIDTH);
      setRightWidth(Math.min(RIGHT_MAX, maxForCenter, Math.max(RIGHT_MIN, drag.startWidth - delta)));
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  // Re-clamp panel widths against the current bounds and viewport size — keeps
  // stale widths (from an earlier session, or a smaller max after an update)
  // from ever rendering outside the allowed range, and reacts to window resizes.
  useEffect(() => {
    const clamp = () => {
      const otherRight = rightCollapsed ? 0 : rightWidth;
      const otherLeft = leftCollapsed ? 0 : leftWidth;
      setLeftWidth((current) => Math.min(LEFT_MAX, Math.max(LEFT_MIN, current), Math.max(LEFT_MIN, window.innerWidth - otherRight - MIN_CENTER_WIDTH)));
      setRightWidth((current) => Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, current), Math.max(RIGHT_MIN, window.innerWidth - otherLeft - MIN_CENTER_WIDTH)));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftCollapsed, rightCollapsed]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cmRef = useRef<JsonCodeEditorHandle>(null);
  const [documentName, setDocumentName] = useState("northstar-api.json");
  const [activeDocumentKey, setActiveDocumentKey] = useState<string | null>("northstar-api.json");
  const [activeSection, setActiveSection] = useState<"current" | "documents">("current");
  const [workspaceDocuments, setWorkspaceDocuments] = useState<Record<number, DocumentRecord[]>>({ 1: starterDocuments, 2: [] });
  const [workspaces, setWorkspaces] = useState<Workspace[]>(starterWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(1);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [workspaceDraftType, setWorkspaceDraftType] = useState<Workspace["type"]>("Personal");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareJson, setCompareJson] = useState(initialJson.replace('"rateLimit": 100', '"rateLimit": 120'));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const compareCurrentRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);

  const workspace = workspaces.find((item) => item.id === workspaceId) || workspaces[0];
  const documents = workspaceDocuments[workspaceId] || [];
  const lineCount = useMemo(() => json.split("\n").length, [json]);
  const diffRows = useMemo(() => diffLines(json, compareJson), [compareJson, json]);
  const changedRows = useMemo(() => diffRows.filter((row) => row.status !== "same"), [diffRows]);
  const diffStatuses = useMemo(() => lineStatusMaps(diffRows), [diffRows]);
  const differences = useMemo(() => {
    try {
      return valueDiffs(JSON.parse(json), JSON.parse(compareJson));
    } catch {
      return null; // one side is invalid JSON — structural diff unavailable
    }
  }, [compareJson, json]);
  const pathDiffs = differences ?? [];

  const createWorkspace = () => {
    const name = workspaceDraft.trim();
    if (!name) return;
    const next = { id: Date.now(), name, type: workspaceDraftType, color: workspaceDraftType === "Team" ? "bg-[#7c5ce3]" : "bg-[#e07a5f]" };
    setWorkspaces((current) => [...current, next]);
    setWorkspaceDocuments((current) => ({ ...current, [next.id]: [] }));
    setWorkspaceId(next.id);
    setActiveDocumentKey(null);
    setDocumentName("untitled.json");
    setJson("{\n  \n}");
    setActiveSection("documents");
    setWorkspaceDraft("");
    setWorkspaceDraftType("Personal");
    setWorkspaceMenuOpen(false);
    setFormatMessage(`Created ${next.type.toLowerCase()} workspace`);
  };

  const saveDocument = () => {
    const name = documentName.trim() || "untitled.json";
    const record = { name, content: json, updated: "Just now" };
    setWorkspaceDocuments((current) => {
      const currentDocuments = current[workspaceId] || [];
      const existing = activeDocumentKey ? currentDocuments.findIndex((document) => document.name === activeDocumentKey) : -1;
      const nextDocuments = existing < 0 ? [record, ...currentDocuments] : currentDocuments.map((document, index) => index === existing ? record : document);
      return { ...current, [workspaceId]: nextDocuments };
    });
    setActiveDocumentKey(name);
    setDocumentName(name);
    setFormatMessage("Saved to My documents");
    setActiveSection("current");
  };

  const switchWorkspace = (id: number) => {
    setWorkspaceId(id);
    setWorkspaceMenuOpen(false);
    setActiveDocumentKey(null);
    setDocumentName("untitled.json");
    setJson("{\n  \n}");
    setActiveSection("documents");
    setView("editor");
    setCompareOpen(false);
    const nextWorkspace = workspaces.find((item) => item.id === id);
    setFormatMessage(nextWorkspace ? `Switched to ${nextWorkspace.name}` : "Workspace switched");
  };

  const createDocument = () => {
    setActiveDocumentKey(null);
    setDocumentName("untitled.json");
    setJson("{\n  \n}");
    setStatus("valid");
    setFormatMessage("");
    setActiveSection("current");
    setView("editor");
    setCompareOpen(false);
  };

  const openDocument = (name: string, content: string) => {
    setActiveDocumentKey(name);
    setDocumentName(name);
    setJson(content);
    setStatus("valid");
    setFormatMessage("");
    setActiveSection("current");
    setView("editor");
    setCompareOpen(false);
  };

  const updateJson = (value: string) => {
    setJson(value);
    try {
      JSON.parse(value);
      setStatus("valid");
    } catch {
      setStatus("invalid");
    }
  };

  const handleTreeEdit = (path: (string | number)[], newValue: unknown) => {
    try {
      const updated = setAtPath(JSON.parse(json), path, newValue);
      setJson(JSON.stringify(updated, null, 2));
      setStatus("valid");
      toast.success("Value updated from tree view");
    } catch {
      toast.error("Could not apply the edit — fix the JSON syntax first");
    }
  };

  const sortCandidates = useMemo(() => {
    if (status !== "valid") return [];
    try {
      return findTableCandidates(JSON.parse(json)).map((c) => ({ key: c.key, path: c.path, fields: arrayObjectFields(c.rows) }));
    } catch {
      return [];
    }
  }, [json, status]);

  const applySort = (direction: SortDirection) => {
    try {
      const root = JSON.parse(json);
      if (sortTargetKey === "__root_object__") {
        setJson(JSON.stringify(sortJsonValue(root, direction), null, 2));
      } else {
        const target = sortCandidates.find((c) => c.key === sortTargetKey) ?? sortCandidates[0];
        if (!target) return;
        const currentRows = target.path.reduce((node: unknown, key) => (node as Record<string, unknown>)[key as string], root as unknown);
        const sorted = sortJsonValue(currentRows, direction, sortField || undefined);
        setJson(JSON.stringify(setAtPath(root, target.path, sorted), null, 2));
      }
      setStatus("valid");
      toast.success(`Sorted ${direction === "asc" ? "ascending" : "descending"}`);
      setSortOpen(false);
    } catch {
      toast.error("Could not sort — fix the JSON syntax first");
    }
  };

  const runSchemaValidation = () => {
    try {
      const schema = JSON.parse(schemaText);
      const value = JSON.parse(json);
      const result = validateAgainstSchema(schema, value);
      setSchemaIssues(result.issues);
      setSchemaError("");
      if (result.ok) toast.success("Document matches the schema");
      else toast.error(`${result.issues.length} schema violation${result.issues.length === 1 ? "" : "s"} found`);
    } catch (error) {
      setSchemaIssues(null);
      setSchemaError(error instanceof Error ? error.message : "Could not run validation");
    }
  };

  const queryResults = useMemo(() => {
    if (view !== "query") return { matches: [], error: "" };
    try {
      return { matches: queryJson(JSON.parse(json), queryText), error: "" };
    } catch {
      return { matches: [], error: "The document is not valid JSON — fix it in the editor (or hit Format) to query it." };
    }
  }, [json, queryText, view]);
  useEffect(() => setQueryLimit(50), [queryText, json]);

  const exportCsv = () => {
    try {
      const csv = jsonToCsv(JSON.parse(json));
      downloadFile(documentName.replace(/\.json$/i, "") + ".csv", csv, "text/csv");
      toast.success("CSV downloaded", { description: "Arrays become rows; nested fields become dot-path columns." });
    } catch {
      toast.error("Cannot convert: the document is not valid JSON");
    }
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (/\.csv$/i.test(file.name)) {
          setJson(JSON.stringify(csvToJson(text), null, 2));
          setDocumentName(file.name.replace(/\.csv$/i, ".json"));
          toast.success(`Converted ${file.name} to JSON`);
        } else {
          const result = repairJson(text);
          if (result.error) throw new Error(result.error);
          setJson(result.value);
          setDocumentName(file.name.endsWith(".json") ? file.name : `${file.name}.json`);
          toast.success(result.repaired ? `Imported and repaired ${file.name}` : `Imported ${file.name}`);
        }
        setActiveDocumentKey(null);
        setStatus("valid");
        setActiveSection("current");
        setView("editor");
      } catch (error) {
        toast.error(`Could not import ${file.name}`, { description: error instanceof Error ? error.message : undefined });
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const formatJson = () => {
    const result = repairJson(json);
    if (result.error) {
      setStatus("invalid");
      setFormatMessage(`Could not repair: ${result.error}`);
      return;
    }
    setJson(result.value);
    setStatus("valid");
    setFormatMessage(result.repaired ? "Repaired and formatted" : "Formatted");
  };

  const minifyJson = () => {
    const result = repairJson(json);
    if (result.error) {
      setStatus("invalid");
      setFormatMessage(`Could not repair: ${result.error}`);
      return;
    }
    setJson(JSON.stringify(JSON.parse(result.value)));
    setStatus("valid");
    setFormatMessage(result.repaired ? "Repaired and minified" : "Minified");
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadJson = () => {
    downloadFile(documentName.endsWith(".json") ? documentName : `${documentName}.json`, json);
    toast.success(`Downloaded ${documentName.endsWith(".json") ? documentName : `${documentName}.json`}`);
  };

  // Cmd+S / Ctrl+S downloads the document to disk instead of triggering the
  // browser's "Save Page As" dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        downloadJson();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, documentName]);

  const jumpToNote = (note: Note) => {
    const lines = json.split("\n");
    const lineIndex = Math.max(0, Math.min(lines.length - 1, note.line - 1));
    const pathSegments = note.path.split(/[.[]/).filter(Boolean);
    const segment = pathSegments[pathSegments.length - 1]?.replace("]", "") || note.path;
    const fallbackLineIndex = lines.findIndex((line) => line.toLowerCase().includes(segment.toLowerCase()));
    const targetLineIndex = lines[note.line - 1]?.toLowerCase().includes(segment.toLowerCase()) ? lineIndex : fallbackLineIndex;
    if (targetLineIndex < 0) return;
    setView("editor");
    cmRef.current?.jumpToLine(targetLineIndex + 1);
  };

  const openCommentComposer = (lineOverride?: number) => {
    const line = lineOverride ?? cmRef.current?.getCursorLine() ?? 1;
    setCommentLine(line);
    setContextMenu(null);
    setShowComposer(true);
  };

  useEffect(() => {
    const closeMenus = () => { setContextMenu(null); setMoreOpen(false); setHeaderMenuOpen(false); };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const addNote = () => {
    if (!noteText.trim()) return;
    const lineText = json.split("\n")[commentLine - 1] || "";
    const key = lineText.match(/"([^"\\]+)"\s*:/)?.[1] || `line ${commentLine}`;
    const note = { id: editingNoteId || Date.now(), title: noteTitle.trim() || "Untitled note", text: noteText.trim(), path: key, line: commentLine, mention: noteMention.trim(), color: "bg-cyan-400" };
    setNotes((current) => editingNoteId ? current.map((item) => item.id === editingNoteId ? { ...item, ...note, color: item.color } : item) : [...current, note]);
    setNoteTitle("");
    setNoteText("");
    setNoteMention("");
    setEditingNoteId(null);
    setShowComposer(false);
  };

  const editNote = (note: Note) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteText(note.text);
    setNoteMention(note.mention);
    setCommentLine(note.line);
    setShowComposer(false);
  };

  const shareLink = async (includeCompare: boolean) => {
    const link = buildShareLink({ name: documentName, json, compare: includeCompare ? compareJson : undefined });
    const label = includeCompare ? "Comparison link" : "Share link";
    // Every browser caps URL length (Firefox/Safari ~65-80k chars) — a link
    // beyond that would silently fail to open for the recipient, so we warn
    // instead of handing out a link that won't carry the real document.
    if (link.length > 60_000) {
      toast.error("This document is too large for a share link", {
        description: "Use Download or Copy JSON from the More menu instead — the recipient's browser can't open a link this long.",
      });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: documentName, url: link });
        toast.success("Shared");
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        // fall through to clipboard
      }
    }
    const ok = await copyText(link);
    if (ok) toast.success(`${label} copied to clipboard`, { description: "The document travels inside the link — nothing is uploaded." });
    else toast.error("Could not copy the link — check browser clipboard permissions");
  };

  const comparisonReport = () =>
    buildComparisonReport({
      documentName,
      leftJson: json,
      rightJson: compareJson,
      rows: diffRows,
      values: differences,
      generatedAt: new Date().toLocaleString(),
    });

  const exportReport = () => {
    downloadFile(documentName.replace(/\.json$/i, "") + "-comparison.md", comparisonReport(), "text/markdown");
    toast.success("Comparison report downloaded", { description: "Markdown file with summary, per-path table, changed lines, and both documents." });
  };

  const copyReport = async () => {
    const ok = await copyText(comparisonReport());
    if (ok) toast.success("Comparison report copied as markdown");
    else toast.error("Could not copy — check browser clipboard permissions");
  };

  // Load a document shared via link (the JSON travels in the URL hash only).
  useEffect(() => {
    const payload = readShareLink(window.location.hash);
    if (!payload) return;
    setDocumentName(payload.name);
    setJson(payload.json);
    setActiveDocumentKey(null);
    if (payload.compare) {
      setCompareJson(payload.compare);
      setCompareOpen(true);
    }
    setFormatMessage(payload.compare ? "Loaded shared comparison" : "Loaded shared document");
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToCompareLine = (leftLine: number, rightLine: number) => {
    const jump = (editor: HTMLTextAreaElement | null, content: string, line: number) => {
      if (!editor) return;
      const lines = content.split("\n");
      const target = Math.max(0, Math.min(lines.length - 1, line - 1));
      const start = lines.slice(0, target).join("\n").length + (target ? 1 : 0);
      editor.focus();
      editor.setSelectionRange(start, start + lines[target].length);
      editor.scrollTop = Math.max(0, target * 24 - editor.clientHeight / 3);
      editor.dispatchEvent(new Event("scroll"));
    };
    jump(compareCurrentRef.current, json, leftLine);
    jump(compareRef.current, compareJson, rightLine);
  };

  const visibleNotes = notes.filter((note) =>
    `${note.title} ${note.text} ${note.path}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#172033]">
      <header className="flex h-[76px] items-center justify-between border-b border-[#e9eaf2] bg-white px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#172033] text-white shadow-lg shadow-slate-300/60">
            <Braces size={22} strokeWidth={2.6} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold tracking-[-0.03em]">JotJSON</h1>
              <span className="rounded-md bg-[#eef0ff] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0f766e]">Beta</span>
            </div>
            <p className="text-xs font-medium text-slate-400">Format, annotate, remember.</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={() => setHelpOpen((current) => !current)} className={`header-button ${helpOpen ? "bg-slate-100 text-slate-800" : ""}`}><CircleHelp size={17} /> Help</button>
          <div className="relative">
            <button onClick={(event) => { event.stopPropagation(); setHeaderMenuOpen((current) => !current); }} className={`header-button ${headerMenuOpen ? "bg-slate-100 text-slate-800" : ""}`} aria-label="More options"><MoreHorizontal size={18} /></button>
            {headerMenuOpen && <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-[#dce6e5] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]">
              <button onClick={() => { setHelpOpen(true); setHeaderMenuOpen(false); }} className="menu-item"><CircleHelp size={15} className="text-[#0f766e]" /> Keyboard shortcuts</button>
              <button onClick={async () => { if (await copyText(window.location.origin)) toast.success("App link copied"); setHeaderMenuOpen(false); }} className="menu-item"><Share2 size={15} className="text-[#0f766e]" /> Copy app link</button>
            </div>}
          </div>
          <div className="ml-2 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#9b8cff] to-[#6257e8] text-xs font-bold text-white">AV</div>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-76px)] flex-col lg:flex-row">
        <div className="relative hidden lg:flex">
          {leftCollapsed ? (
            <div className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-[#e9eaf2] bg-white py-5">
              <button onClick={() => setLeftCollapsed(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen size={18} /></button>
              <div className="h-px w-6 bg-[#eef0f5]" />
              <button onClick={() => { setLeftCollapsed(false); createDocument(); }} className="rounded-lg p-2 text-[#0f766e] transition hover:bg-[#e6f7f4]" aria-label="New document" title="New document"><FilePlus2 size={18} /></button>
              <button onClick={() => { setLeftCollapsed(false); setActiveSection("current"); }} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="Current document" title="Current document"><FileJson2 size={18} /></button>
              <button onClick={() => { setLeftCollapsed(false); setActiveSection("documents"); }} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="My documents" title="My documents"><FolderOpen size={18} /></button>
            </div>
          ) : (
            <aside style={{ width: leftWidth }} className="flex shrink-0 flex-col border-r border-[#e9eaf2] bg-white px-4 py-6">
              <div className="mb-2 flex items-center justify-end"><button onClick={() => setLeftCollapsed(true)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="Collapse sidebar" title="Collapse sidebar"><PanelLeftClose size={16} /></button></div>
              <div className="relative mb-5"><button onClick={() => setWorkspaceMenuOpen((current) => !current)} className="flex w-full items-center gap-3 rounded-xl border border-[#e3e6ef] bg-[#fafbfc] p-3 text-left transition hover:border-[#9ed3c8]"><span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white ${workspace.color}`}><Building2 size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-700">{workspace.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{workspace.type} workspace</span></span><ChevronDown size={15} className={`text-slate-400 transition-transform ${workspaceMenuOpen ? "rotate-180" : ""}`} /></button>{workspaceMenuOpen && <div className="absolute left-0 right-0 top-[68px] z-30 rounded-xl border border-[#e3e6ef] bg-white p-2 shadow-[0_12px_30px_rgba(23,32,51,0.12)]"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Switch workspace</p>{workspaces.map((item) => <button key={item.id} onClick={() => switchWorkspace(item.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${item.id === workspaceId ? "bg-[#e6f7f4] text-[#0f766e]" : "text-slate-600 hover:bg-slate-50"}`}><span className={`h-2 w-2 rounded-full ${item.color}`} />{item.name}<span className="ml-auto text-[9px] uppercase text-slate-400">{item.type}</span></button>)}<div className="my-1 border-t border-[#eef0f5]" /><input value={workspaceDraft} onChange={(event) => setWorkspaceDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createWorkspace()} placeholder="New workspace name" className="w-full rounded-lg border border-[#e3e6ef] px-2.5 py-2 text-xs outline-none focus:border-[#9ed3c8]" /><div className="mt-2 grid grid-cols-2 gap-1"><button onClick={() => setWorkspaceDraftType("Personal")} className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Personal" ? "bg-[#e6f7f4] text-[#0f766e]" : "bg-slate-50 text-slate-400"}`}>Personal</button><button onClick={() => setWorkspaceDraftType("Team")} className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Team" ? "bg-[#eeeaff] text-[#6b4ec4]" : "bg-slate-50 text-slate-400"}`}>Team</button></div><button onClick={createWorkspace} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[#172033] py-2 text-xs font-bold text-white"><Plus size={13} /> Create workspace</button></div>}</div>
              <button onClick={() => createDocument()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-[#5149da]">
                <FilePlus2 size={17} /> New document
              </button>
              <nav className="mt-7 space-y-1">
                <button onClick={() => setActiveSection("current")} className={`sidebar-link ${activeSection === "current" ? "sidebar-link-active" : ""}`}><FileJson2 size={17} /> Current document</button>
                <button onClick={() => setActiveSection("documents")} className={`sidebar-link ${activeSection === "documents" ? "sidebar-link-active" : ""}`}><FolderOpen size={17} /> My documents</button>
              </nav>
              <div className="mt-9 border-t border-[#eef0f5] pt-5">
                <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent</p>
                {documents.map((document) => <button key={document.name} onClick={() => openDocument(document.name, document.content)} className={`recent-link ${documentName === document.name ? "bg-[#f4fbfa] text-[#0f766e]" : ""}`}><span className={`h-2 w-2 rounded-full ${document.name.includes("webhook") ? "bg-[#ffb64d]" : "bg-[#0f766e]"}`} /> {document.name}</button>)}
              </div>
              <div className="mt-auto rounded-xl bg-[#f3f2ff] px-4 py-4 text-sm text-[#4d46c9]">
                <Sparkles size={18} className="mb-2" />
                <p className="font-bold">Keep context close.</p>
                <p className="mt-1 text-xs leading-5 text-[#716bd2]">Notes stay attached to the structure they explain.</p>
              </div>
            </aside>
          )}
          {!leftCollapsed && <div onPointerDown={startDrag("left")} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} className="group absolute right-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"><div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[#9ed3c8] group-active:bg-[#0f766e]" /><GripVertical size={12} className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[#9ed3c8] group-hover:block" /></div>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-[#e6e8f0] bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between xl:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-400"><FileJson2 size={16} /> {workspace.name} <span>/</span> {activeSection === "documents" ? "My documents" : "Workspace"} <span>/</span> <input aria-label="Document name" value={documentName} onChange={(event) => setDocumentName(event.target.value)} className="min-w-0 max-w-[220px] truncate bg-transparent font-semibold text-slate-700 outline-none focus:border-b focus:border-[#0f766e]" /></div>
              <div className="mt-1.5 flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`} /><span className={`text-xs font-semibold ${status === "valid" ? "text-emerald-600" : "text-rose-600"}`}>{status === "valid" ? "Valid JSON" : "Invalid JSON"}</span>{formatMessage ? <span className="text-xs font-semibold text-[#0f766e]">{formatMessage}</span> : <span className="text-xs text-slate-400">Click Format to repair common mistakes</span>}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={saveDocument} className="tool-button border-[#9ed3c8] bg-[#e6f7f4] text-[#0f766e]"><Check size={16} /> Save</button>
              <button onClick={formatJson} className="tool-button"><WandSparkles size={16} /> Format</button>
              <button onClick={() => setCompareOpen((current) => !current)} className={`tool-button ${compareOpen ? "border-[#9ed3c8] bg-[#e6f7f4] text-[#0f766e]" : ""}`}><GitCompare size={16} /> Compare</button>
              <button onClick={minifyJson} className="tool-button"><Code2 size={16} /> Minify</button>
              <button onClick={() => shareLink(compareOpen)} className="tool-button"><Share2 size={16} /> Share</button>
              <input ref={fileInputRef} type="file" accept=".json,.csv,.txt,application/json,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ""; }} />
              <div className="relative">
                <button onClick={(event) => { event.stopPropagation(); setMoreOpen((current) => !current); }} className={`tool-button ${moreOpen ? "border-[#9ed3c8] bg-[#e6f7f4] text-[#0f766e]" : ""}`} aria-label="More tools"><MoreHorizontal size={16} /> More</button>
                {moreOpen && <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-[#dce6e5] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]">
                  <button onClick={() => { fileInputRef.current?.click(); setMoreOpen(false); }} className="menu-item"><Upload size={15} className="text-[#0f766e]" /> Import file<span className="menu-hint">.json / .csv / .txt</span></button>
                  <button onClick={() => { exportCsv(); setMoreOpen(false); }} className="menu-item"><FileSpreadsheet size={15} className="text-[#0f766e]" /> Convert to CSV<span className="menu-hint">download as .csv</span></button>
                  <button onClick={() => { copyJson(); setMoreOpen(false); }} className="menu-item">{copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} className="text-[#0f766e]" />} Copy JSON<span className="menu-hint">to clipboard</span></button>
                  <button onClick={() => { downloadJson(); setMoreOpen(false); }} className="menu-item"><Download size={15} className="text-[#0f766e]" /> Download .json</button>
                  <div className="my-1 border-t border-[#eef0f5]" />
                  <button onClick={() => { setSortOpen(true); setMoreOpen(false); }} className="menu-item"><ArrowUpDown size={15} className="text-[#0f766e]" /> Sort JSON<span className="menu-hint">by field or key</span></button>
                  <button onClick={() => { setSchemaOpen(true); setMoreOpen(false); }} className="menu-item"><ShieldCheck size={15} className="text-[#0f766e]" /> Validate schema<span className="menu-hint">JSON Schema</span></button>
                </div>}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-5 p-4 lg:flex-row lg:p-6">
            <section className={fullscreen ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" : "relative flex h-[calc(100vh-250px)] min-h-[480px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]"}>
              {activeSection === "documents" && <div className="absolute inset-0 z-20 overflow-auto bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xl font-bold tracking-[-0.03em] text-slate-800">My documents</p><p className="mt-1 text-sm text-slate-400">Saved JSON files in {workspace.name}. Switch workspaces from the left panel.</p></div><button onClick={() => createDocument()} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#0f766e] px-3 py-2 text-xs font-bold text-white"><FilePlus2 size={15} /> New document</button></div><div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>{documents.map((document) => <button key={document.name} onClick={() => openDocument(document.name, document.content)} className="group min-w-0 rounded-xl border border-[#e3e6ef] p-4 text-left transition hover:border-[#9ed3c8] hover:bg-[#f4fbfa]"><div className="flex items-center justify-between"><FileJson2 size={20} className="text-[#0f766e]" /><ChevronDown size={15} className="-rotate-90 text-slate-300 transition group-hover:text-[#0f766e]" /></div><p className="mt-5 truncate text-sm font-bold text-slate-700">{document.name}</p><p className="mt-1 text-xs text-slate-400">Updated {document.updated}</p></button>)}</div></div>}
              {compareOpen && changedRows.length > 0 && <div className="absolute bottom-0 left-0 right-0 z-30 max-h-44 overflow-auto border-t border-[#dce6e5] bg-white/95 p-3 shadow-[0_-8px_25px_rgba(23,32,51,0.08)]"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Line changes <span className="ml-1 font-normal text-slate-400">{changedRows.length}</span></p><span className="text-[10px] text-slate-400">Click to jump in both panes</span></div><div className="space-y-1">{changedRows.map((row, index) => <button key={`${row.leftLine}-${row.rightLine}-${index}`} onClick={() => jumpToCompareLine(row.leftLine ?? row.rightLine ?? 1, row.rightLine ?? row.leftLine ?? 1)} className="grid w-full gap-2 rounded-lg border border-[#ebeaf2] bg-white p-2 text-left text-[11px] hover:border-[#9ed3c8] sm:grid-cols-[88px_1fr_1fr]"><span className="font-mono font-bold text-[#0f766e]">{row.status === "added" ? `+ L${row.rightLine}` : row.status === "removed" ? `− L${row.leftLine}` : `L${row.leftLine} → L${row.rightLine}`}</span><span className={`truncate ${row.status === "added" ? "text-slate-300" : "text-rose-600"}`}>{row.status === "added" ? "—" : `− ${row.leftText.trim() || '""'}`}</span><span className={`truncate ${row.status === "removed" ? "text-slate-300" : "text-emerald-600"}`}>{row.status === "removed" ? "—" : `+ ${row.rightText.trim() || '""'}`}</span></button>)}</div></div>}
              {compareOpen && <div className="absolute inset-0 z-10 flex flex-col bg-white">
                <div className="flex flex-wrap items-center gap-3 border-b border-[#edf0f4] px-5 py-3">
                  <div className="min-w-[200px] flex-1"><p className="text-sm font-bold text-slate-700">Compare JSON</p><p className="mt-1 text-xs text-slate-400">Both sides are editable — changes highlight live. <span className="rounded bg-amber-100 px-1">changed</span> <span className="rounded bg-rose-100 px-1">removed</span> <span className="rounded bg-emerald-100 px-1">added</span></p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={copyReport} className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"><Copy size={14} /> Copy report</button>
                    <button onClick={exportReport} className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"><Download size={14} /> Export report</button>
                    <button onClick={() => shareLink(true)} className="tool-button h-8 shrink-0 whitespace-nowrap border-[#9ed3c8] bg-[#e6f7f4] px-2.5 text-[11px] text-[#0f766e]"><Share2 size={14} /> Share comparison</button>
                    <button onClick={() => setCompareOpen(false)} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close compare"><X size={16} /></button>
                  </div>
                </div>
                <div className="grid flex-1 gap-4 overflow-auto p-4 pb-48 xl:grid-cols-2">
                  <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[#e3e6ef]">
                    <div className="border-b border-[#edf0f4] px-4 py-2.5 text-xs font-bold text-slate-600">Current JSON — {documentName}</div>
                    <ComparePane value={json} onChange={updateJson} statuses={diffStatuses.left} editorRef={compareCurrentRef} ariaLabel="Current JSON comparison" />
                  </div>
                  <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[#9ed3c8]">
                    <div className="border-b border-[#d9eeea] bg-[#f4fbfa] px-4 py-2.5 text-xs font-bold text-[#0f766e]">Compare with</div>
                    <ComparePane value={compareJson} onChange={setCompareJson} statuses={diffStatuses.right} editorRef={compareRef} ariaLabel="Compare JSON" />
                  </div>
                  <div className="xl:col-span-2 rounded-xl border border-[#e3e6ef] bg-[#fafbfc] p-4">
                    <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-700">Differences by path <span className="ml-2 text-xs font-normal text-slate-400">Click a row to jump to it in both panes</span></p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pathDiffs.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{pathDiffs.length ? `${pathDiffs.filter((d) => d.kind === "changed").length} changed · ${pathDiffs.filter((d) => d.kind === "added").length} added · ${pathDiffs.filter((d) => d.kind === "removed").length} removed` : differences === null ? "Invalid JSON" : "No changes"}</span></div>
                    {pathDiffs.length > 0 ? <div className="mt-3 space-y-2">{pathDiffs.map((difference) => { const targetRow = changedRows.find((row) => row.leftText.includes(`"${difference.path.split(".").pop()?.replace(/\[\d+\]/, "")}"`) || row.rightText.includes(`"${difference.path.split(".").pop()?.replace(/\[\d+\]/, "")}"`)); return <button key={difference.path} onClick={() => targetRow && jumpToCompareLine(targetRow.leftLine ?? targetRow.rightLine ?? 1, targetRow.rightLine ?? targetRow.leftLine ?? 1)} className="grid w-full gap-2 rounded-lg border border-[#ebeaf2] bg-white p-3 text-left text-xs transition hover:border-[#9ed3c8] sm:grid-cols-[64px_1fr_1fr_1fr]"><span className={`self-start rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase ${difference.kind === "added" ? "bg-emerald-50 text-emerald-700" : difference.kind === "removed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{difference.kind}</span><span className="break-all font-mono font-semibold text-[#0f766e]">{difference.path}</span><span className="break-all text-rose-600">− {difference.before}</span><span className="break-all text-emerald-600">+ {difference.after}</span></button>; })}</div> : <p className="mt-3 text-xs text-slate-400">{differences === null ? "One side is not valid JSON — fix the syntax (or hit Format) to see path-level differences. Line changes still highlight above." : "The two JSON documents match."}</p>}
                  </div>
                </div>
              </div>}
              <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-3">
                <div className="flex items-center gap-4"><button onClick={() => { setView("editor"); setCompareOpen(false); }} className={view === "editor" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Editor</button><button onClick={() => { setView("tree"); setCompareOpen(false); }} className={view === "tree" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Tree view</button><button onClick={() => { setView("query"); setCompareOpen(false); }} className={view === "query" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Query</button><button onClick={() => { setView("table"); setCompareOpen(false); }} className={view === "table" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Table</button></div>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-400"><span>{lineCount} lines</span><button onClick={() => setFullscreen((current) => !current)} className="text-slate-500 hover:text-slate-900" aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div>
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[#fcfcfe]">
                {view === "query" ? <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden">
                  <div className="border-b border-[#edf0f4] bg-[#fafbfc] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <TerminalSquare size={16} className="absolute left-3.5 top-3 text-[#0f766e]" />
                        <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="e.g. endpoints[?auth=true].name" spellCheck={false} className="w-full rounded-xl border border-[#e3e6ef] bg-white py-2.5 pl-10 pr-24 font-mono text-sm shadow-sm outline-none transition focus:border-[#9ed3c8] focus:shadow-[0_0_0_3px_rgba(15,118,110,0.08)]" />
                        <span className={`absolute right-3 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${queryResults.error ? "bg-rose-50 text-rose-600" : "bg-[#e6f7f4] text-[#0f766e]"}`}>{queryResults.error ? "invalid doc" : `${queryResults.matches.length.toLocaleString()} match${queryResults.matches.length === 1 ? "" : "es"}`}</span>
                      </div>
                      {queryResults.matches.length > 0 && <button onClick={async () => { const payload = queryResults.matches.length === 1 ? queryResults.matches[0].value : queryResults.matches.map((m) => m.value); if (await copyText(JSON.stringify(payload, null, 2))) toast.success("Query result copied as JSON"); }} className="tool-button h-10 shrink-0"><Copy size={14} /> Copy result</button>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Try:</span>
                      {["endpoints[*].name", "endpoints[?auth=true].path", "settings.*", "endpoints[0]"].map((example) => <button key={example} onClick={() => setQueryText(example)} className={`rounded-md px-2 py-1 font-mono text-[10px] transition ${queryText === example ? "bg-[#0f766e] text-white" : "bg-white text-slate-500 shadow-sm hover:bg-[#e6f7f4] hover:text-[#0f766e]"}`}>{example}</button>)}
                      <span className="ml-auto hidden text-[10px] text-slate-400 sm:block">dot paths · [index] · [*] · [?field=value] · &gt; &lt; !=</span>
                    </div>
                  </div>
                  <div className="grid flex-1 overflow-hidden lg:grid-cols-2">
                    <div className="flex min-h-[240px] flex-col overflow-hidden border-b border-[#edf0f4] lg:border-b-0 lg:border-r">
                      <div className="flex items-center justify-between border-b border-[#edf0f4] bg-white px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Document — {documentName}</span><span className="text-[10px] text-slate-400">{lineCount.toLocaleString()} lines</span></div>
                      <pre className="flex-1 overflow-auto bg-[#fcfcfe] p-4 font-mono text-xs leading-6 text-[#33415c]">{json}</pre>
                    </div>
                    <div className="flex min-h-[240px] flex-col overflow-hidden">
                      <div className="flex items-center justify-between border-b border-[#edf0f4] bg-white px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Results</span>{queryResults.matches.length > queryLimit && <span className="text-[10px] text-slate-400">showing {queryLimit.toLocaleString()} of {queryResults.matches.length.toLocaleString()}</span>}</div>
                      <div className="flex-1 space-y-2.5 overflow-auto bg-[#fafbfc] p-4">
                        {queryResults.error && <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">{queryResults.error}</div>}
                        {!queryResults.error && queryResults.matches.slice(0, queryLimit).map((match) => <div key={match.path} className="rounded-xl border border-[#ebeaf2] bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="break-all font-mono text-[10px] font-bold text-[#0f766e]">{match.path}</p><button onClick={async () => { if (await copyText(JSON.stringify(match.value, null, 2))) toast.success("Copied"); }} className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-slate-50 hover:text-[#0f766e]" aria-label="Copy this value"><Copy size={12} /></button></div>{typeof match.value === "string" && /^https?:\/\/\S+$/i.test(match.value) ? <a href={match.value} target="_blank" rel="noopener noreferrer" className="mt-1.5 block break-all font-mono text-xs leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{match.value}</a> : <pre className="mt-1.5 max-h-64 overflow-auto font-mono text-xs leading-5 text-slate-600">{previewValue(match.value)}</pre>}</div>)}
                        {!queryResults.error && queryResults.matches.length > queryLimit && <button onClick={() => setQueryLimit((current) => current + 100)} className="w-full rounded-xl border border-dashed border-[#9ed3c8] py-2.5 text-xs font-bold text-[#0f766e] transition hover:bg-[#f4fbfa]">Show 100 more</button>}
                        {!queryResults.error && queryResults.matches.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No matches for this query.</p>}
                      </div>
                    </div>
                  </div>
                </div> : view === "table" ? <TableView json={json} onChange={(value) => { updateJson(value); setFormatMessage(""); }} /> : view === "tree" ? <div className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f4] bg-[#fafbfc] px-4 py-2"><div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Braces size={15} className="text-[#0f766e]" /> Interactive structure <span className="hidden sm:inline">• click a value to edit it</span></div><div className="ml-auto flex items-center gap-1"><span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Levels:</span>{[1, 2, 3].map((level) => <button key={level} onClick={() => setTreeDepth(level)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === level ? "bg-[#0f766e] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[#0f766e]"}`}>{level}</button>)}<button onClick={() => setTreeDepth(99)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 99 ? "bg-[#0f766e] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[#0f766e]"}`}>Expand all</button><button onClick={() => setTreeDepth(0)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 0 ? "bg-[#0f766e] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[#0f766e]"}`}>Collapse all</button></div></div><div className="min-h-0 flex-1 overflow-auto p-5">{status === "valid" ? <JsonTree key={`depth-${treeDepth}`} label="root" value={JSON.parse(json)} openDepth={treeDepth} onEdit={handleTreeEdit} /> : <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">Fix the JSON syntax to view the tree.</div>}</div></div> : <JsonCodeEditor ref={cmRef} value={json} onChange={(value) => { updateJson(value); setFormatMessage(""); }} noteLines={notes.map((note) => note.line)} onNoteClick={(line) => { const target = notes.find((note) => note.line === line); if (target) jumpToNote(target); }} onContextMenu={(line, x, y) => setContextMenu({ x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 80), line })} />}
                {view === "editor" && <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-[#e6e7ef] bg-white/95 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm"><span className={`h-1.5 w-1.5 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`} /> UTF-8 <span className="text-slate-300">•</span> Spaces: 2</div>}
                {contextMenu && view === "editor" && <div onClick={(event) => event.stopPropagation()} className="fixed z-50 w-52 rounded-xl border border-[#dce6e5] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={() => openCommentComposer(contextMenu.line)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-[#e6f7f4] hover:text-[#0f766e]"><MessageSquarePlus size={15} className="text-[#0f766e]" /> Add comment on line {contextMenu.line}</button></div>}
              </div>
            </section>

            <div className="relative hidden lg:flex">
              {!rightCollapsed && <div onPointerDown={startDrag("right")} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} className="group absolute left-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"><div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[#9ed3c8] group-active:bg-[#0f766e]" /><GripVertical size={12} className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[#9ed3c8] group-hover:block" /></div>}
              {rightCollapsed ? (
                <div className="flex w-11 shrink-0 flex-col items-center gap-3 rounded-2xl border border-[#e3e6ef] bg-white py-5 shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
                  <button onClick={() => setRightCollapsed(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="Expand notes panel" title="Expand notes panel"><PanelRightOpen size={18} /></button>
                  <div className="h-px w-6 bg-[#eef0f5]" />
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e6f7f4] text-[10px] font-bold text-[#0f766e]">{notes.length}</span>
                  <button onClick={() => { setRightCollapsed(false); openCommentComposer(); }} className="rounded-lg p-2 text-[#0f766e] transition hover:bg-[#e6f7f4]" aria-label="Add reference note" title="Add reference note"><MessageSquarePlus size={18} /></button>
                </div>
              ) : (
                <aside style={{ width: rightWidth }} className="flex h-[calc(100vh-250px)] min-h-[480px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
                  <aside className="flex h-[calc(100vh-250px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
              <div className="border-b border-[#edf0f4] px-5 pb-4 pt-5">
                <div className="flex items-center justify-between"><div><p className="text-base font-bold tracking-[-0.025em]">Reference notes</p><p className="mt-1 text-xs text-slate-400">Context for future you.</p></div><div className="flex items-center gap-2"><span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#e6f7f4] px-1 text-xs font-bold text-[#0f766e]">{notes.length}</span><button onClick={() => setRightCollapsed(true)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-[#0f766e]" aria-label="Collapse notes panel" title="Collapse notes panel"><PanelRightClose size={16} /></button></div></div>
                <div className="relative mt-4"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" className="w-full rounded-lg border border-[#e6e8f0] bg-[#fafbfc] py-2 pl-9 pr-3 text-xs outline-none transition focus:border-[#8f88ec]" /></div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                {visibleNotes.map((note) => editingNoteId === note.id ? (
                  <div key={note.id} className="rounded-xl border border-[#9ed3c8] bg-[#f4fbfa] p-4">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#0f766e]"><Pencil size={12} /> Editing comment on line {commentLine}</div>
                    <input autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400" />
                    <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What should you remember?" className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 text-slate-600 outline-none placeholder:text-slate-400" />
                    <input value={noteMention} onChange={(event) => setNoteMention(event.target.value)} placeholder="Mention a name (optional)" className="mt-1 w-full border-b border-[#d9eeea] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400" />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => { setEditingNoteId(null); setNoteTitle(""); setNoteText(""); setNoteMention(""); }} className="text-xs font-semibold text-slate-500">Cancel</button>
                      <button onClick={addNote} className="rounded-md bg-[#0f766e] px-2.5 py-1.5 text-xs font-bold text-white">Update note</button>
                    </div>
                  </div>
                ) : <article key={note.id} onClick={() => jumpToNote(note)} className="group relative cursor-pointer rounded-xl border border-[#ebeaf2] p-4 transition hover:border-[#cfcced] hover:shadow-sm"><span className={`absolute left-0 top-4 h-8 w-1 rounded-r ${note.color}`} /><div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex"><button onClick={(event) => { event.stopPropagation(); editNote(note); }} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Edit note"><Pencil size={13} /></button><button onClick={(event) => { event.stopPropagation(); setNotes((current) => current.filter((item) => item.id !== note.id)); }} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Remove note"><X size={14} /></button></div><p className="pl-2 text-sm font-bold text-slate-700">{note.title}</p><p className="mt-2 pl-2 text-xs leading-5 text-slate-500">{note.text}</p>{note.mention && <p className="mt-2 pl-2 text-[10px] font-bold text-[#0f766e]">Mentioned: @{note.mention}</p>}<div className="mt-3 flex items-center gap-1.5 pl-2 font-mono text-[10px] text-[#0f766e]"><ChevronDown size={12} /> {note.path} <span className="ml-auto font-sans text-[10px] font-bold uppercase tracking-wide text-slate-400">Jump to line</span></div></article>)}
                {visibleNotes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No matching notes.</p>}
                {showComposer && !editingNoteId ? <div className="rounded-xl border border-[#9ed3c8] bg-[#f4fbfa] p-3"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#0f766e]"><MessageSquare size={13} /> Comment on line {commentLine}</div><input autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" /><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What should you remember?" className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400" /><input value={noteMention} onChange={(event) => setNoteMention(event.target.value)} placeholder="Mention a name (optional)" className="mt-2 w-full border-b border-[#d9eeea] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400" /><div className="mt-2 flex justify-end gap-2"><button onClick={() => { setShowComposer(false); setEditingNoteId(null); }} className="text-xs font-semibold text-slate-500">Cancel</button><button onClick={addNote} className="rounded-md bg-[#0f766e] px-2.5 py-1.5 text-xs font-bold text-white">{editingNoteId ? "Update note" : "Save note"}</button></div></div> : <button onClick={() => openCommentComposer()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#9ed3c8] py-3 text-sm font-bold text-[#0f766e] transition hover:bg-[#f4fbfa]"><MessageSquarePlus size={16} /> Add reference note</button>}
              </div>
            </aside>
                </aside>
              )}
            </div>
          </div>
        </div>
      </section>

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[#e3e6ef] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Keyboard shortcuts</p><button onClick={() => setHelpOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ["Save / download JSON", "⌘ S / Ctrl S"],
                ["Format document", "Format button"],
                ["Find / replace in editor", "⌘ F / Ctrl F"],
                ["Fold or unfold a block", "click the ▾ / ▸ arrow"],
                ["Undo / redo", "⌘ Z / Ctrl Z"],
                ["Add comment on a line", "right-click the line"],
              ].map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between border-b border-[#f1f3f9] pb-2 last:border-0">
                  <span className="text-slate-600">{label}</span>
                  <span className="rounded-md bg-[#f4fbfa] px-2 py-1 font-mono text-xs font-semibold text-[#0f766e]">{keys}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sortOpen && (
        <div onClick={() => setSortOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[#e3e6ef] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Sort JSON</p><button onClick={() => setSortOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            {sortCandidates.length === 0 && !(status === "valid" && (() => { try { const v = JSON.parse(json); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; } })()) ? (
              <p className="mt-4 text-sm text-slate-500">This document has no array to sort, and isn't a plain object either. Fix the JSON syntax or open a different document.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-400">Sort an array (by field, or its values directly) or sort an object's keys alphabetically.</p>
                <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">Target</label>
                <select value={sortTargetKey ?? sortCandidates[0]?.key ?? "__root_object__"} onChange={(event) => { setSortTargetKey(event.target.value); setSortField(""); }} className="mt-1 w-full rounded-lg border border-[#e3e6ef] bg-white px-3 py-2 text-sm outline-none focus:border-[#9ed3c8]">
                  {sortCandidates.map((c) => <option key={c.key} value={c.key}>{c.key === "root" ? "Root array" : `"${c.key}" array`}</option>)}
                  {(() => { try { const v = JSON.parse(json); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; } })() && <option value="__root_object__">Root object — sort keys A→Z</option>}
                </select>
                {sortTargetKey !== "__root_object__" && (sortCandidates.find((c) => c.key === (sortTargetKey ?? sortCandidates[0]?.key))?.fields.length ?? 0) > 0 && (
                  <>
                    <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-400">Sort by field</label>
                    <select value={sortField} onChange={(event) => setSortField(event.target.value)} className="mt-1 w-full rounded-lg border border-[#e3e6ef] bg-white px-3 py-2 text-sm outline-none focus:border-[#9ed3c8]">
                      <option value="">(sort values directly)</option>
                      {sortCandidates.find((c) => c.key === (sortTargetKey ?? sortCandidates[0]?.key))?.fields.map((field) => <option key={field} value={field}>{field}</option>)}
                    </select>
                  </>
                )}
                {sortTargetKey !== "__root_object__" ? (
                  <div className="mt-5 flex gap-2">
                    <button onClick={() => applySort("asc")} className="tool-button flex-1 justify-center"><ArrowUp size={15} /> Ascending</button>
                    <button onClick={() => applySort("desc")} className="tool-button flex-1 justify-center"><ArrowDown size={15} /> Descending</button>
                  </div>
                ) : (
                  <button onClick={() => applySort("asc")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f766e] py-2.5 text-sm font-bold text-white"><ArrowUpDown size={15} /> Sort keys A→Z</button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {schemaOpen && (
        <div onClick={() => setSchemaOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[#e3e6ef] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Validate against JSON Schema</p><button onClick={() => setSchemaOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <p className="mt-1 text-xs text-slate-400">Paste a JSON Schema (draft-07 or newer) — validation runs entirely in your browser, nothing is uploaded.</p>
            <textarea value={schemaText} onChange={(event) => setSchemaText(event.target.value)} spellCheck={false} className="mt-3 h-40 w-full resize-none rounded-lg border border-[#e3e6ef] bg-[#fafbfc] p-3 font-mono text-xs outline-none focus:border-[#9ed3c8]" />
            <button onClick={runSchemaValidation} className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#0f766e] py-2.5 text-sm font-bold text-white"><ShieldCheck size={16} /> Validate current document</button>
            {schemaError && <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">{schemaError}</div>}
            {schemaIssues && (
              <div className="mt-3 min-h-0 flex-1 overflow-auto">
                {schemaIssues.length === 0 ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">✓ Document matches the schema.</div>
                ) : (
                  <div className="space-y-2">
                    {schemaIssues.map((issue, index) => (
                      <div key={index} className="rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-xs">
                        <span className="font-mono font-bold text-rose-700">{issue.path}</span>
                        <span className="ml-2 text-rose-600">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
