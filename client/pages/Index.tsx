import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AlertCircle,
  AtSign,
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
  FileText,
  TerminalSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
  Table as TableIcon,
  ShieldCheck,
  FileCode2,
  Loader2,
  History as HistoryIcon,
  RotateCcw,
  Trash2,
  CircleCheck,
  CornerDownRight,
  Reply as ReplyIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sun,
  Moon,
  Laptop,
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
  Mail,
  Phone,
  Send,
  MessageCircle,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  Camera,
  PictureInPicture,
  Layers,
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

type Reply = { id: number; text: string; mention: string; at: number };
type Note = { id: number; title: string; text: string; path: string; line: number; mention: string; color: string; resolved?: boolean; replies?: Reply[] };
type DocumentRecord = { name: string; content: string; updated: string };
type Workspace = { id: number; name: string; type: "Personal" | "Team"; color: string };

import { repairJson } from "@/lib/jsonRepair";
import { getJsonErrorLine } from "@/lib/utils";
import { buildComparisonReport, diffLines, lineStatusMaps, valueDiffs, type LineStatus } from "@/lib/diff";
import { copyText, downloadFile } from "@/lib/share";
import { buildSnapshotLink, embedNotesInJson, extractAnnotatedJsonNotes, generateShortAlias, parseSnapshotFile, readSnapshotFromHash, serializeSnapshotFile, type Snapshot } from "@/lib/snapshot";
import { csvToJson, extractCsvNotesAndData, jsonToCsv, queryJson, setAtPath } from "@/lib/convert";
import { CODEGEN_LANGUAGES, generateCode } from "@/lib/codegen";
import { CONVERT_FORMATS, formatToJson, jsonToFormat, type ConvertFormat } from "@/lib/convertFormats";
import { clearHistory, deleteVersion, listVersions, saveVersion, type Version } from "@/lib/history";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { inferJsonSchema, validateAgainstSchema, type SchemaIssue } from "@/lib/schema";
import { arrayObjectFields, sortJsonValue, type SortDirection } from "@/lib/sort";
import JsonCodeEditor, { type JsonCodeEditorHandle } from "@/components/JsonCodeEditor";
import JsonGraph from "@/components/JsonGraph";

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
            className="min-w-[120px] rounded border border-[var(--brand-border)] bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none"
          />
        ) : (
          <>
            {typeof value === "string" && /^https?:\/\/\S+$/i.test(value) ? (
              <a href={value} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800" title="Open link in a new tab">"{value}"</a>
            ) : (
              <button
                onClick={() => { if (onEdit) { setDraft(JSON.stringify(value)); setEditing(true); } }}
                className={`rounded px-0.5 text-left ${typeof value === "string" ? "text-amber-600" : typeof value === "boolean" ? "text-violet-600" : "text-sky-600"} ${onEdit ? "cursor-text hover:bg-[var(--brand-soft)] hover:outline hover:outline-1 hover:outline-[var(--brand-border)]" : ""}`}
                title={onEdit ? "Click to edit value" : undefined}
              >
                {JSON.stringify(value)}
              </button>
            )}

            {onEdit && <button onClick={() => { setDraft(JSON.stringify(value)); setEditing(true); }} className="hidden text-slate-300 hover:text-[var(--brand)] group-hover:block" aria-label="Edit value"><Pencil size={11} /></button>}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen((current) => !current)} className="flex items-center gap-1.5 py-1.5 text-left font-mono text-xs font-semibold text-slate-700 hover:text-[var(--brand)]" style={{ paddingLeft: depth * 20 }}>
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
  errorLine?: number | null;
  errorMessage?: string | null;
};

/** Editable textarea with a synced backdrop that paints diff colors & red squiggly syntax error lines. */
function DiffPane({ value, onChange, statuses, editorRef, ariaLabel, errorLine, errorMessage }: DiffPaneProps) {
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
      {/* Backdrop paints the visible text + diff colors + red squiggly syntax error line; textarea on top is transparent */}
      <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="min-w-max p-4 font-mono text-xs leading-6 text-slate-700">
          {lines.map((line, index) => {
            const isError = errorLine === index + 1;
            return (
              <div
                key={index}
                className={`h-6 whitespace-pre ${
                  isError
                    ? "bg-rose-100/90 text-rose-800 font-bold underline decoration-rose-500 decoration-wavy decoration-2 ring-1 ring-rose-400"
                    : statusStyles[statuses.get(index + 1) ?? "same"]
                }`}
              >
                {line || " "}
                {isError && (
                  <span className="ml-3 inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 font-sans text-[10px] font-bold text-white shadow-2xs">
                    <AlertCircle size={11} /> {errorMessage || "Syntax error on this line"}
                  </span>
                )}
              </div>
            );
          })}
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
        className="absolute inset-0 h-full w-full resize-none whitespace-pre bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-slate-700 outline-none selection:bg-[var(--brand-selection)] selection:text-transparent"
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
  const errorInfo = useMemo(() => getJsonErrorLine(value), [value]);

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
      <div className="flex items-center gap-1 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-2 py-1.5">
        {(["editor", "tree", "query"] as PaneMode[]).map((item) => (
          <button key={item} onClick={() => setMode(item)} className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize transition ${mode === item ? "bg-[var(--brand)] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-[var(--brand)]"}`}>
            {item === "editor" ? "Text" : item}
          </button>
        ))}
        <span className="ml-auto pr-2 text-[10px] font-semibold text-slate-400">{statuses.size > 0 ? `${statuses.size} lines differ` : "in sync"}</span>
      </div>
      {mode === "editor" && <DiffPane value={value} onChange={onChange} statuses={statuses} editorRef={editorRef} ariaLabel={ariaLabel} errorLine={errorInfo.line} errorMessage={errorInfo.message} />}
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
          <div className="border-b border-[var(--edge)] p-2.5">
            <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="e.g. items[?price>100].name — dot paths, [index], [*], filters" spellCheck={false} className="w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-[var(--brand-border)]" />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-[var(--surface-soft)] p-2.5">
            {parsed.error && <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">Fix the JSON syntax to query this document.</div>}
            {!parsed.error && matches.slice(0, limit).map((match) => (
              <div key={match.path} className="rounded-lg border border-[var(--edge-soft)] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="break-all font-mono text-[10px] font-bold text-[var(--brand)]">{match.path}</p>
                  <button onClick={async () => { if (await copyText(JSON.stringify(match.value, null, 2))) toast.success("Copied"); }} className="shrink-0 rounded p-1 text-slate-300 transition hover:text-[var(--brand)]" aria-label="Copy this value"><Copy size={12} /></button>
                </div>
                {typeof match.value === "string" && /^https?:\/\/\S+$/i.test(match.value) ? (
                  <a href={match.value} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-mono text-[11px] leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{match.value}</a>
                ) : (
                  <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] leading-5 text-slate-600">{previewValue(match.value)}</pre>
                )}
              </div>
            ))}
            {!parsed.error && matches.length > limit && <button onClick={() => setLimit((current) => current + 100)} className="w-full rounded-lg border border-dashed border-[var(--brand-border)] py-2 text-xs font-bold text-[var(--brand)] transition hover:bg-[var(--brand-soft-hover)]">Show 100 more ({(matches.length - limit).toLocaleString()} left)</button>}
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
    return <div className="flex min-h-0 flex-1 items-center justify-center p-6"><div className="max-w-sm rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-5 text-center text-sm text-slate-500"><TableIcon size={22} className="mx-auto mb-2 text-[var(--brand)]" />Table view works with an array of objects. This document doesn't have one at the root or in a top-level field — try Tree or Query instead.</div></div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><TableIcon size={15} className="text-[var(--brand)]" /> {candidate.rows.length} row{candidate.rows.length === 1 ? "" : "s"} <span className="hidden sm:inline">• click a column header to sort, click a cell to edit • scroll right for more columns</span></div>
        {candidates.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Array:</span>
            {candidates.map((c) => (
              <button key={c.key} onClick={() => setSelectedKey(c.key)} title={`View "${c.key}" as a table`} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold transition ${candidate.key === c.key ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}><TableIcon size={12} />{c.key}</button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <table key={candidate.key} className="border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface-page)]">
            <tr>
              {columns.map((column) => (
                <th key={column} onClick={() => toggleSort(column)} className="cursor-pointer whitespace-nowrap border-b border-r border-[var(--edge-soft)] px-3 py-2 font-mono font-bold text-slate-600 hover:bg-[var(--brand-soft-hover)]">
                  <span className="flex items-center gap-1">{column}{sort?.field === column ? (sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} className="text-slate-300" />}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidate.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[var(--surface-soft)]">
                {columns.map((column) => {
                  const cellValue = row[column];
                  const isUrl = typeof cellValue === "string" && /^https?:\/\/\S+$/i.test(cellValue);
                  return (
                    <td key={column} className="border-b border-r border-[var(--edge-soft)] px-3 py-1.5 font-mono">
                      {isUrl ? (
                        <a href={cellValue as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{cellValue as string}</a>
                      ) : (
                        <input
                          defaultValue={cellValue === undefined ? "" : JSON.stringify(cellValue)}
                          onBlur={(event) => { if (event.target.value !== JSON.stringify(cellValue)) editCell(rowIndex, column, event.target.value); }}
                          className={`w-full min-w-[80px] bg-transparent outline-none focus:bg-[var(--brand-soft-hover)] ${typeof cellValue === "string" ? "text-amber-700" : typeof cellValue === "boolean" ? "text-violet-600" : typeof cellValue === "number" ? "text-sky-600" : "text-slate-400"}`}
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
  { id: 1, name: "Personal Office", type: "Personal", color: "bg-[var(--brand)]" },
  { id: 2, name: "API Guild", type: "Team", color: "bg-[var(--violet)]" },
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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [json, setJson] = useState(initialJson);
  const [status, setStatus] = useState<"valid" | "invalid">("valid");
  const [notes, setNotes] = useState<Note[]>(starterNotes);
  const [documentNotes, setDocumentNotes] = useState<Record<string, Note[]>>({
    "1:northstar-api.json": starterNotes,
  });
  const [noteText, setNoteText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteMention, setNoteMention] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [search, setSearch] = useState("");
  const [noteFilter, setNoteFilter] = useState<"all" | "open" | "resolved">("all");
  const [replyingNoteId, setReplyingNoteId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMention, setReplyMention] = useState("");
  const [copied, setCopied] = useState(false);
  const [formatMessage, setFormatMessage] = useState("");
  const [commentLine, setCommentLine] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const [view, setView] = useState<"editor" | "tree" | "query" | "table" | "graph">("editor");
  const [sharedBanner, setSharedBanner] = useState<{ hasCompare: boolean; noteCount: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [queryText, setQueryText] = useState("endpoints[*].name");
  const [queryLimit, setQueryLimit] = useState(50);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [floatingWidgetOpen, setFloatingWidgetOpen] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const [helpTab, setHelpTab] = useState<"query" | "contact" | "faq">("query");
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportCategory, setSupportCategory] = useState("General Query");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportIncludeJson, setSupportIncludeJson] = useState(true);
  const [querySubmitted, setQuerySubmitted] = useState(false);
  const [queryRefId, setQueryRefId] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [callbackTime, setCallbackTime] = useState("Morning (9 AM - 12 PM)");
  const [callbackSubmitted, setCallbackSubmitted] = useState(false);

  // Sync main JSON state into open Document Picture-in-Picture window
  useEffect(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      const textarea = pipWindowRef.current.document.getElementById("pip-text") as HTMLTextAreaElement;
      if (textarea && textarea.value !== json) {
        textarea.value = json;
        const linesSpan = pipWindowRef.current.document.getElementById("pip-lines");
        if (linesSpan) linesSpan.innerText = `${json.split("\n").length} lines`;
      }
    }
  }, [json]);

  // Automatic Spotify / Google Meet style Overlay detection:
  // When developer switches away to another tab or application (VS Code, Terminal, Postman),
  // automatically show the floating mini-editor overlay! When returning to JSONote tab, auto-dock/close it.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (!pipWindowRef.current && !floatingWidgetOpen) {
          setFloatingWidgetOpen(true);
        }
      } else {
        if (floatingWidgetOpen) {
          setFloatingWidgetOpen(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [floatingWidgetOpen]);

  const toggleDocumentPip = async () => {
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setPipActive(false);
      return;
    }

    if (typeof window !== "undefined" && (window as unknown as { documentPictureInPicture?: { requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window> } }).documentPictureInPicture?.requestWindow) {
      try {
        const pipWin = await (window as unknown as { documentPictureInPicture: { requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window> } }).documentPictureInPicture.requestWindow({
          width: 480,
          height: 540,
        });

        pipWin.document.title = "JSONote — Floating Mini-Editor";
        pipWin.document.body.style.margin = "0";
        pipWin.document.body.style.padding = "10px";
        pipWin.document.body.style.background = "#0f172a";
        pipWin.document.body.style.color = "#f8fafc";
        pipWin.document.body.style.boxSizing = "border-box";

        pipWin.document.body.innerHTML = `
          <div style="display:flex; flex-direction:column; height:calc(100vh - 20px); gap:8px; font-family:system-ui,-apple-system,sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:6px; border-bottom:1px solid #334155;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:bold; font-size:13px; color:#38bdf8;">📌 JSONote Mini</span>
                <span id="pip-status" style="font-size:10px; padding:2px 6px; border-radius:99px; background:#065f46; color:#34d399; font-weight:bold;">Valid</span>
              </div>
              <div style="display:flex; gap:6px;">
                <button id="pip-format" style="background:#0284c7; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">⚡ Format</button>
                <button id="pip-copy" style="background:#334155; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">📋 Copy</button>
              </div>
            </div>
            <textarea id="pip-text" style="flex:1; width:100%; background:#020617; color:#f8fafc; border:1px solid #334155; border-radius:8px; padding:10px; font-family:monospace; font-size:12px; resize:none; outline:none; box-sizing:border-box; line-height:1.5;"></textarea>
            <div style="font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
              <span>⚡ Live two-way sync with main JSONote</span>
              <span id="pip-lines">0 lines</span>
            </div>
          </div>
        `;

        const textarea = pipWin.document.getElementById("pip-text") as HTMLTextAreaElement;
        const formatBtn = pipWin.document.getElementById("pip-format");
        const copyBtn = pipWin.document.getElementById("pip-copy");
        const statusBadge = pipWin.document.getElementById("pip-status");
        const linesSpan = pipWin.document.getElementById("pip-lines");

        if (textarea) {
          textarea.value = json;
          if (linesSpan) linesSpan.innerText = `${json.split("\n").length} lines`;

          textarea.oninput = (e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            setJson(val);
            if (linesSpan) linesSpan.innerText = `${val.split("\n").length} lines`;
            try {
              JSON.parse(val);
              if (statusBadge) {
                statusBadge.innerText = "Valid";
                statusBadge.style.background = "#065f46";
                statusBadge.style.color = "#34d399";
              }
            } catch {
              if (statusBadge) {
                statusBadge.innerText = "Invalid";
                statusBadge.style.background = "#881337";
                statusBadge.style.color = "#fda4af";
              }
            }
          };
        }

        if (formatBtn) {
          formatBtn.onclick = () => {
            try {
              const parsed = JSON.parse(textarea.value);
              const formatted = JSON.stringify(parsed, null, 2);
              textarea.value = formatted;
              setJson(formatted);
              if (linesSpan) linesSpan.innerText = `${formatted.split("\n").length} lines`;
              if (statusBadge) {
                statusBadge.innerText = "Valid";
                statusBadge.style.background = "#065f46";
                statusBadge.style.color = "#34d399";
              }
              toast.success("Formatted in floating window!");
            } catch {
              toast.error("Invalid JSON syntax");
            }
          };
        }

        if (copyBtn) {
          copyBtn.onclick = async () => {
            await copyText(textarea.value);
            copyBtn.innerText = "✓ Copied";
            setTimeout(() => {
              if (copyBtn) copyBtn.innerText = "📋 Copy";
            }, 1500);
          };
        }

        pipWindowRef.current = pipWin;
        setPipActive(true);

        pipWin.onunload = () => {
          pipWindowRef.current = null;
          setPipActive(false);
        };
      } catch (err) {
        console.warn("Document Picture-in-Picture window launch failed, enabling floating widget", err);
        setFloatingWidgetOpen(true);
      }
    } else {
      setFloatingWidgetOpen((current) => !current);
    }
  };

  const handleQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportName.trim() || !supportEmail.trim() || !supportMessage.trim()) {
      toast.error("Please fill in your name, email, and query message.");
      return;
    }

    const snippet = supportIncludeJson ? json.slice(0, 1200) : undefined;
    const refId = `Q-${Math.floor(10000 + Math.random() * 90000)}`;

    const mailSubject = encodeURIComponent(`[JSONote Query #${refId}] ${supportSubject || supportCategory}`);
    const mailBodyText = `Name: ${supportName}
Email: ${supportEmail}
Category: ${supportCategory}
Ref ID: #${refId}

Query Details:
${supportMessage}

${snippet ? `\n--- Attached JSON Snippet (Sanitized) ---\n${snippet}` : ""}`;

    const encodedBody = encodeURIComponent(mailBodyText);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=${mailSubject}&body=${encodedBody}`;

    setQueryRefId(refId);
    setQuerySubmitted(true);

    // Open Gmail Web Compose directly in Chrome/browser (bypasses macOS Mail app!)
    window.open(gmailUrl, "_blank");
    toast.success(`Query #${refId} registered! Opening Gmail Web Compose...`);
  };

  const handleCallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackPhone.trim()) {
      toast.error("Please enter your phone number for callback.");
      return;
    }
    setCallbackSubmitted(true);
    toast.success("Callback request submitted! We will call you at your preferred time.");
  };

  const resetSupportForms = () => {
    setQuerySubmitted(false);
    setCallbackSubmitted(false);
    setSupportSubject("");
    setSupportMessage("");
    setCallbackPhone("");
  };
  const [sortOpen, setSortOpen] = useState(false);
  const [sortTargetKey, setSortTargetKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState("");
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState('{\n  "type": "object",\n  "required": [],\n  "properties": {}\n}');
  const [schemaIssues, setSchemaIssues] = useState<SchemaIssue[] | null>(null);
  const [schemaError, setSchemaError] = useState("");
  const [codegenOpen, setCodegenOpen] = useState(false);
  const [codegenLangIndex, setCodegenLangIndex] = useState(0);
  const [codegenRootName, setCodegenRootName] = useState("Root");
  const [codegenOutput, setCodegenOutput] = useState("");
  const [codegenError, setCodegenError] = useState("");
  const [codegenLoading, setCodegenLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertFormatId, setConvertFormatId] = useState<ConvertFormat>("yaml");
  const [convertDirection, setConvertDirection] = useState<"to" | "from">("to");
  const [convertInput, setConvertInput] = useState("");
  const [convertOutput, setConvertOutput] = useState("");
  const [convertError, setConvertError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<Version[]>([]);
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
  const normalizedJsons = useMemo(() => {
    try {
      const leftParsed = JSON.parse(json);
      const rightParsed = JSON.parse(compareJson);
      return {
        left: JSON.stringify(leftParsed, null, 2),
        right: JSON.stringify(rightParsed, null, 2),
      };
    } catch {
      return { left: json, right: compareJson };
    }
  }, [compareJson, json]);

  const diffRows = useMemo(() => diffLines(normalizedJsons.left, normalizedJsons.right), [normalizedJsons]);
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

  const compareValidity = useMemo(() => {
    let leftValid = true;
    let rightValid = true;
    try {
      JSON.parse(json);
    } catch {
      leftValid = false;
    }
    try {
      JSON.parse(compareJson);
    } catch {
      rightValid = false;
    }
    return { leftValid, rightValid, bothValid: leftValid && rightValid };
  }, [compareJson, json]);

  const autoFixCompareSyntax = () => {
    let repairedLeft = json;
    let repairedRight = compareJson;
    let leftRepaired = false;
    let rightRepaired = false;

    if (!compareValidity.leftValid) {
      const res = repairJson(json);
      if (res.repaired) {
        repairedLeft = res.value;
        leftRepaired = true;
      }
    }

    if (!compareValidity.rightValid) {
      const res = repairJson(compareJson);
      if (res.repaired) {
        repairedRight = res.value;
        rightRepaired = true;
      }
    }

    if (leftRepaired) updateJson(repairedLeft);
    if (rightRepaired) setCompareJson(repairedRight);

    if (leftRepaired || rightRepaired) {
      toast.success("Auto-fixed JSON syntax and formatted comparison");
    } else {
      toast.error("Could not auto-fix syntax — check brackets manually.");
    }
  };

  const createWorkspace = () => {
    const name = workspaceDraft.trim();
    if (!name) return;
    const next = { id: Date.now(), name, type: workspaceDraftType, color: workspaceDraftType === "Team" ? "bg-[var(--violet)]" : "bg-[var(--terracotta)]" };
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
    // Automatically format & auto-repair JSON first upon save
    let finalJson = json;
    const result = repairJson(json);
    if (!result.error) {
      finalJson = result.value;
      setJson(result.value);
      setStatus("valid");
    }

    const name = documentName.trim() || "untitled.json";
    const record = { name, content: finalJson, updated: "Just now" };
    setWorkspaceDocuments((current) => {
      const currentDocuments = current[workspaceId] || [];
      const existing = activeDocumentKey ? currentDocuments.findIndex((document) => document.name === activeDocumentKey) : -1;
      const nextDocuments = existing < 0 ? [record, ...currentDocuments] : currentDocuments.map((document, index) => index === existing ? record : document);
      return { ...current, [workspaceId]: nextDocuments };
    });
    setActiveDocumentKey(name);
    setDocumentName(name);

    toast.success("Saved to workspace", {
      description: "JSON formatted and saved to your workspace.",
    });
    setFormatMessage("Saved to My documents");
    setActiveSection("current");
  };

  const switchWorkspace = (id: number) => {
    // Save current notes for current workspace & document
    const currentKey = `${workspaceId}:${documentName}`;
    setDocumentNotes((all) => ({ ...all, [currentKey]: notes }));

    setWorkspaceId(id);
    setWorkspaceMenuOpen(false);

    const targetDocs = workspaceDocuments[id] || [];
    if (targetDocs.length > 0) {
      const firstDoc = targetDocs[0];
      setActiveDocumentKey(firstDoc.name);
      setDocumentName(firstDoc.name);
      setJson(firstDoc.content);
      const targetKey = `${id}:${firstDoc.name}`;
      setNotes(documentNotes[targetKey] || (firstDoc.name === "northstar-api.json" ? starterNotes : []));
    } else {
      setActiveDocumentKey(null);
      setDocumentName("untitled.json");
      setJson("{\n  \n}");
      const targetKey = `${id}:untitled.json`;
      setNotes(documentNotes[targetKey] || []);
    }

    setActiveSection("documents");
    setView("editor");
    setCompareOpen(false);
    const nextWorkspace = workspaces.find((item) => item.id === id);
    setFormatMessage(nextWorkspace ? `Switched to ${nextWorkspace.name}` : "Workspace switched");
  };

  const createDocument = () => {
    const currentKey = `${workspaceId}:${documentName}`;
    setDocumentNotes((all) => ({ ...all, [currentKey]: notes }));

    setActiveDocumentKey(null);
    setDocumentName("untitled.json");
    setJson("{\n  \n}");
    setStatus("valid");
    setFormatMessage("");
    setActiveSection("current");
    setView("editor");
    setCompareOpen(false);
    setNotes([]);
  };

  const openDocument = (name: string, content: string) => {
    const currentKey = `${workspaceId}:${documentName}`;
    setDocumentNotes((all) => ({ ...all, [currentKey]: notes }));

    setActiveDocumentKey(name);
    setDocumentName(name);
    setJson(content);
    setStatus("valid");
    setFormatMessage("");
    setActiveSection("current");
    setView("editor");
    setCompareOpen(false);

    const targetKey = `${workspaceId}:${name}`;
    setNotes(documentNotes[targetKey] || (name === "northstar-api.json" ? starterNotes : []));
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
      setSchemaError("");
      const parsedSchema = JSON.parse(schemaText);
      const parsedJson = JSON.parse(json);
      const result = validateAgainstSchema(parsedSchema, parsedJson);
      setSchemaIssues(result.issues);
    } catch (error) {
      setSchemaIssues(null);
      setSchemaError(error instanceof Error ? error.message : "Could not run validation");
    }
  };

  const generateSchemaFromDoc = () => {
    try {
      const parsed = JSON.parse(json);
      const inferred = inferJsonSchema(parsed);
      setSchemaText(JSON.stringify(inferred, null, 2));
      toast.success("Generated schema from active document");
    } catch {
      toast.error("Document is not valid JSON — fix syntax before generating schema.");
    }
  };

  const loadTestSchema = () => {
    try {
      const parsed = JSON.parse(json);
      const inferred = inferJsonSchema(parsed) as Record<string, unknown>;
      const required = Array.isArray(inferred.required) ? [...inferred.required, "apiKey"] : ["apiKey"];
      const testSchema = { ...inferred, required };
      setSchemaText(JSON.stringify(testSchema, null, 2));
      toast.info("Loaded test schema requiring 'apiKey' field");
    } catch {
      setSchemaText(
        JSON.stringify(
          {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            required: ["name", "version", "apiKey"],
            properties: {
              name: { type: "string" },
              version: { type: "string" },
              apiKey: { type: "string" },
            },
          },
          null,
          2
        )
      );
      toast.info("Loaded sample test schema requiring 'apiKey' field");
    }
  };

  const runCodegen = async () => {
    setCodegenLoading(true);
    setCodegenError("");
    const language = CODEGEN_LANGUAGES[codegenLangIndex] ?? CODEGEN_LANGUAGES[0];
    const result = await generateCode(json, language, codegenRootName);
    setCodegenLoading(false);
    if (result.error) {
      setCodegenError(result.error);
      setCodegenOutput("");
    } else {
      setCodegenOutput(result.code);
    }
  };

  const copyCode = async () => {
    if (await copyText(codegenOutput)) toast.success("Code copied to clipboard");
    else toast.error("Could not copy — check browser clipboard permissions");
  };

  const downloadCode = () => {
    const language = CODEGEN_LANGUAGES[codegenLangIndex] ?? CODEGEN_LANGUAGES[0];
    const base = documentName.replace(/\.json$/i, "") || "model";
    downloadFile(`${base}.${language.ext}`, codegenOutput, "text/plain");
    toast.success(`Downloaded ${base}.${language.ext}`);
  };

  const runConvert = () => {
    setConvertError("");
    if (convertDirection === "to") {
      const result = jsonToFormat(json, convertFormatId);
      if (result.ok) setConvertOutput(result.value);
      else { setConvertOutput(""); setConvertError(result.error); }
    } else {
      const result = formatToJson(convertInput, convertFormatId);
      if (result.ok) setConvertOutput(result.value);
      else { setConvertOutput(""); setConvertError(result.error); }
    }
  };

  const convertFormatInfo = () => CONVERT_FORMATS.find((f) => f.id === convertFormatId) ?? CONVERT_FORMATS[0];

  const copyConvert = async () => {
    if (await copyText(convertOutput)) toast.success("Copied to clipboard");
    else toast.error("Could not copy — check browser clipboard permissions");
  };

  const downloadConvert = () => {
    const base = documentName.replace(/\.json$/i, "") || "document";
    const ext = convertDirection === "to" ? convertFormatInfo().ext : "json";
    downloadFile(`${base}.${ext}`, convertOutput, "text/plain");
    toast.success(`Downloaded ${base}.${ext}`);
  };

  const loadConvertIntoEditor = () => {
    // Only meaningful when converting a format back INTO JSON.
    updateJson(convertOutput);
    setConvertOpen(false);
    setActiveSection("current");
    setView("editor");
    toast.success("Loaded converted JSON into the editor");
  };

  // Auto-save a version 2.5s after editing stops, so history captures how the
  // document evolves without a version per keystroke. Dedupe/prune live in the
  // storage layer. Runs entirely on-device (IndexedDB).
  useEffect(() => {
    const key = documentName.trim() || "untitled.json";
    const timer = window.setTimeout(() => {
      saveVersion(key, key, json).catch(() => {
        /* IndexedDB unavailable (private mode etc.) — history is best-effort */
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [json, documentName]);

  const openHistory = async () => {
    setHistoryOpen(true);
    // Persist the current state immediately so "now" is always in the timeline.
    const key = documentName.trim() || "untitled.json";
    await saveVersion(key, key, json).catch(() => undefined);
    const versions = await listVersions(key).catch(() => [] as Version[]);
    setHistoryVersions(versions);
  };

  const restoreVersion = (version: Version) => {
    updateJson(version.content);
    setActiveSection("current");
    setView("editor");
    setHistoryOpen(false);
    toast.success("Restored version", { description: `From ${new Date(version.savedAt).toLocaleString()}` });
  };

  const compareVersion = (version: Version) => {
    setCompareJson(version.content);
    setCompareOpen(true);
    setView("editor");
    setHistoryOpen(false);
    toast.success("Comparing against this version", { description: "Differences are highlighted in the compare view." });
  };

  const clearDocHistory = async () => {
    const key = documentName.trim() || "untitled.json";
    await clearHistory(key).catch(() => undefined);
    setHistoryVersions([]);
    toast.success("History cleared for this document");
  };

  const removeSingleVersion = async (version: Version) => {
    if (version.id === undefined) return;
    await deleteVersion(version.id).catch(() => undefined);
    setHistoryVersions((prev) => prev.filter((item) => item.id !== version.id));
    toast.success("Snapshot deleted from history");
  };

  const versionDiffCount = (version: Version): number | null => {
    try {
      return valueDiffs(JSON.parse(version.content), JSON.parse(json)).length;
    } catch {
      return null;
    }
  };

  const relativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
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
      const filename = documentName.replace(/\.json$/i, "") + ".csv";
      downloadFile(filename, csv, "text/csv");
      toast.success(`Converted to ${filename}`);
    } catch (error) {
      toast.error("Could not convert to CSV", { description: error instanceof Error ? error.message : "JSON must be an object or array of objects." });
    }
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        // A .jsonote snapshot file restores full shared session (doc, compare, notes, view)
        const snapshot = parseSnapshotFile(text);
        if (snapshot) {
          restoreSnapshot(snapshot, "file");
          return;
        }

        if (/\.csv$/i.test(file.name)) {
          const { dataText, notes: extractedNotes } = extractCsvNotesAndData(text);
          setJson(JSON.stringify(csvToJson(dataText), null, 2));
          const targetName = file.name.replace(/\.csv$/i, ".json");
          setDocumentName(targetName);
          const key = `${workspaceId}:${targetName}`;

          if (extractedNotes && extractedNotes.length > 0) {
            setNotes(extractedNotes);
            setDocumentNotes((all) => ({ ...all, [key]: extractedNotes }));
            toast.success(`Imported ${file.name} — restored ${extractedNotes.length} reference note(s) & replies`);
          } else {
            setNotes([]);
            setDocumentNotes((all) => ({ ...all, [key]: [] }));
            toast.success(`Converted ${file.name} to JSON`);
          }
        } else {
          // Check for embedded comments ($comments or _comments) inside exported JSON
          const { cleanJson, notes: extractedNotes } = extractAnnotatedJsonNotes(text);
          const result = repairJson(cleanJson);
          if (result.error) throw new Error(result.error);

          setJson(result.value);
          const targetName = file.name.endsWith(".json") ? file.name : `${file.name}.json`;
          const key = `${workspaceId}:${targetName}`;

          if (extractedNotes && extractedNotes.length > 0) {
            setNotes(extractedNotes);
            setDocumentNotes((all) => ({ ...all, [key]: extractedNotes }));
            toast.success(`Imported ${file.name} — restored ${extractedNotes.length} reference note(s) & replies`);
          } else {
            setNotes([]);
            setDocumentNotes((all) => ({ ...all, [key]: [] }));
            toast.success(result.repaired ? `Imported and repaired ${file.name}` : `Imported ${file.name}`);
          }
          setDocumentName(targetName);
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
    const payload = notes.length > 0 ? embedNotesInJson(json, notes) : json;
    const filename = documentName.trim() || "download.json";
    downloadFile(filename, payload);
    if (notes.length > 0) {
      toast.success(`Downloaded ${filename} with ${notes.length} reference note(s) & replies`);
    } else {
      toast.success(`Downloaded ${filename}`);
    }
  };

  const downloadPlainJson = () => {
    const filename = documentName.trim() || "download.json";
    downloadFile(filename, json);
    toast.success(`Downloaded plain ${filename}`);
  };

  // Cmd+S / Ctrl+S formats and saves the document to workspace
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDocument();
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
    const closeMenus = () => { setContextMenu(null); setMoreOpen(false); setHeaderMenuOpen(false); setThemeMenuOpen(false); };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const addNote = () => {
    if (!noteText.trim()) return;
    const lineText = json.split("\n")[commentLine - 1] || "";
    const key = lineText.match(/"([^"\\]+)"\s*:/)?.[1] || `line ${commentLine}`;
    const note = { id: editingNoteId || Date.now(), title: noteTitle.trim() || "Untitled note", text: noteText.trim(), path: key, line: commentLine, mention: noteMention.trim(), color: "bg-cyan-400" };
    setNotes((current) => {
      const next = editingNoteId ? current.map((item) => (item.id === editingNoteId ? { ...item, ...note, color: item.color } : item)) : [...current, note];
      const docKey = `${workspaceId}:${documentName}`;
      setDocumentNotes((all) => ({ ...all, [docKey]: next }));
      return next;
    });
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

  const toggleResolve = (note: Note) => {
    setNotes((current) => {
      const next = current.map((item) => (item.id === note.id ? { ...item, resolved: !item.resolved } : item));
      const docKey = `${workspaceId}:${documentName}`;
      setDocumentNotes((all) => ({ ...all, [docKey]: next }));
      return next;
    });
    toast.success(note.resolved ? "Reopened comment" : "Marked resolved");
  };

  const addReply = (noteId: number) => {
    if (!replyText.trim()) return;
    const reply: Reply = { id: Date.now(), text: replyText.trim(), mention: replyMention.trim(), at: Date.now() };
    setNotes((current) => {
      const next = current.map((item) => (item.id === noteId ? { ...item, replies: [...(item.replies ?? []), reply] } : item));
      const docKey = `${workspaceId}:${documentName}`;
      setDocumentNotes((all) => ({ ...all, [docKey]: next }));
      return next;
    });
    setReplyText("");
    setReplyMention("");
    setReplyingNoteId(null);
  };

  // Export the whole annotation set as a shareable markdown review.
  const exportReview = () => {
    const openCount = notes.filter((n) => !n.resolved).length;
    const lines: string[] = [
      `# Review — ${documentName}`,
      "",
      `${notes.length} comment${notes.length === 1 ? "" : "s"} · ${openCount} open · ${notes.length - openCount} resolved`,
      "",
    ];
    for (const note of notes) {
      lines.push(`## ${note.resolved ? "✓ " : ""}${note.title}  \`${note.path}\` (line ${note.line})`);
      if (note.mention) lines.push(`_@${note.mention}_`);
      lines.push("", note.text, "");
      for (const reply of note.replies ?? []) {
        lines.push(`> ${reply.mention ? `**@${reply.mention}:** ` : ""}${reply.text}`);
      }
      if (note.replies?.length) lines.push("");
    }
    downloadFile(documentName.replace(/\.json$/i, "") + "-review.md", lines.join("\n"), "text/markdown");
    toast.success("Review exported", { description: "Markdown with every comment, mention, and reply." });
  };

  // Assemble the full shareable session: the document, an optional comparison,
  // the reference notes, and the active view — so a recipient sees exactly what
  // the sharer sees, including the live diff.
  const buildSnapshot = (includeCompare: boolean): Snapshot => ({
    v: 1,
    name: documentName,
    json,
    compare: includeCompare ? compareJson : undefined,
    notes: notes.length ? notes : undefined,
    view,
    compareOpen: includeCompare,
  });

  const shareLink = async (includeCompare: boolean) => {
    const snapshot = buildSnapshot(includeCompare);
    const link = buildSnapshotLink(snapshot);
    const label = includeCompare ? "Comparison link" : "Share link";
    // Even gzip-compressed, a very large session can exceed the browser URL
    // cap (~65-80k). Rather than hand out a link that silently won't open,
    // fall back to a snapshot file that carries the same session losslessly.
    if (link.length > 60_000) {
      shareAsFile(includeCompare);
      toast.info("Document too large for a link — shared as a snapshot file instead", {
        description: "Send the downloaded .jsonote file. The recipient imports it to see everything, including the differences.",
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
    if (ok) toast.success(`${label} copied to clipboard`, { description: `Compressed compact URL (${link.length} chars). 100% self-contained!` });
    else toast.error("Could not copy the link — check browser clipboard permissions");
  };

  const shareShortAliasLink = async (includeCompare: boolean) => {
    const snapshot = buildSnapshot(includeCompare);
    const alias = generateShortAlias(snapshot);
    const link = `${window.location.origin}${window.location.pathname}#s=${alias}`;
    await copyText(link);
    toast.success("Copied 6-char ultra-short link!", {
      description: `Mini link: ${link}`,
    });
  };

  // Export the session as a portable snapshot file. Importing it anywhere
  // restores the document, the comparison, and the notes — and lands the
  // recipient in the diff immediately.
  const shareAsFile = (includeCompare: boolean) => {
    downloadFile("download.jsonote", serializeSnapshotFile(buildSnapshot(includeCompare)), "application/json");
    toast.success("Snapshot file downloaded", {
      description: "Share the download.jsonote file — the recipient imports it to restore this exact session.",
    });
    setMoreOpen(false);
  };

  // Restore a full session from a snapshot (link or file): document, comparison,
  // notes, active view — then show a banner and land the recipient in the diff.
  const restoreSnapshot = (snapshot: Snapshot, source: "link" | "file") => {
    setDocumentName(snapshot.name);
    setJson(snapshot.json);
    setActiveDocumentKey(null);
    setActiveSection("current");
    try {
      JSON.parse(snapshot.json);
      setStatus("valid");
    } catch {
      setStatus("invalid");
    }
    if (snapshot.notes && snapshot.notes.length) setNotes(snapshot.notes);
    const hasCompare = typeof snapshot.compare === "string";
    if (hasCompare) {
      setCompareJson(snapshot.compare as string);
      setCompareOpen(Boolean(snapshot.compareOpen));
      setView("editor");
    } else if (snapshot.view) {
      setView(snapshot.view);
    }
    setSharedBanner({ hasCompare, noteCount: snapshot.notes?.length ?? 0 });
    toast.success(source === "file" ? "Imported shared session" : "Loaded shared session");
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

  // Load a full session shared via link (the whole session travels compressed
  // in the URL hash — nothing is fetched from a server). Runs on first load and
  // also when a share link is pasted into an already-open tab (hashchange).
  useEffect(() => {
    const loadFromHash = () => {
      const snapshot = readSnapshotFromHash(window.location.hash);
      if (!snapshot) return;
      restoreSnapshot(snapshot, "link");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
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

  const visibleNotes = notes
    .filter((note) => (noteFilter === "all" ? true : noteFilter === "resolved" ? note.resolved : !note.resolved))
    .filter((note) => `${note.title} ${note.text} ${note.path}`.toLowerCase().includes(search.toLowerCase()));
  const openNoteCount = notes.filter((note) => !note.resolved).length;

  return (
    <main className="min-h-screen bg-[var(--surface-page)] text-[var(--ink)]">
      <header className="flex h-[76px] items-center justify-between border-b border-[var(--edge)] bg-white px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--ink-solid)] text-white shadow-[0_8px_20px_var(--neutral-shadow)]">
            <Braces size={22} strokeWidth={2.6} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold tracking-[-0.03em]">JSONote</h1>
              <span className="rounded-md bg-[var(--violet-soft-bg)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--brand)]">Beta</span>
            </div>
            <p className="text-xs font-medium text-slate-400">The JSON editor that remembers.</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="relative">
            <button onClick={(event) => { event.stopPropagation(); setThemeMenuOpen((current) => !current); }} className={`header-button ${themeMenuOpen ? "bg-slate-100 text-slate-800" : ""}`} aria-label="Choose color theme" title="Choose color theme">{isDark ? <Moon size={17} /> : <Sun size={17} />}</button>
            {themeMenuOpen && <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-11 z-40 w-44 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]">
              <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Color theme</p>
              {[
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Laptop },
              ].map((option) => (
                <button key={option.value} onClick={() => { setTheme(option.value); setThemeMenuOpen(false); }} className="menu-item grid-cols-[18px_auto_1fr]">
                  <option.icon size={15} className="text-[var(--brand)]" />
                  {option.label}
                  {theme === option.value && <Check size={14} className="justify-self-end text-[var(--brand)]" />}
                </button>
              ))}
            </div>}
          </div>
          <button onClick={() => setTourOpen(true)} className="header-button bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70" title="Interactive Product Walkthrough"><Sparkles size={15} className="text-amber-500 animate-pulse" /> Take a Tour</button>
          <button onClick={() => setHelpOpen((current) => !current)} className={`header-button ${helpOpen ? "bg-slate-100 text-slate-800" : ""}`}><CircleHelp size={17} /> Help</button>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-76px)] flex-col lg:flex-row">
        <div className="relative hidden lg:flex">
          {leftCollapsed ? (
            <div className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-[var(--edge)] bg-white py-5">
              <button onClick={() => setLeftCollapsed(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen size={18} /></button>
              <div className="h-px w-6 bg-[var(--edge-soft)]" />
              <button onClick={() => { setLeftCollapsed(false); createDocument(); }} className="rounded-lg p-2 text-[var(--brand)] transition hover:bg-[var(--brand-soft)]" aria-label="New document" title="New document"><FilePlus2 size={18} /></button>
              <button onClick={() => { setLeftCollapsed(false); setActiveSection("current"); }} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="Current document" title="Current document"><FileJson2 size={18} /></button>
              <button onClick={() => { setLeftCollapsed(false); setActiveSection("documents"); }} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="My documents" title="My documents"><FolderOpen size={18} /></button>
            </div>
          ) : (
            <aside style={{ width: leftWidth }} className="flex shrink-0 flex-col border-r border-[var(--edge)] bg-white px-4 py-6">
              <div className="mb-2 flex items-center justify-end"><button onClick={() => setLeftCollapsed(true)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="Collapse sidebar" title="Collapse sidebar"><PanelLeftClose size={16} /></button></div>
              <div className="relative mb-5"><button onClick={() => setWorkspaceMenuOpen((current) => !current)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-3 text-left transition hover:border-[var(--brand-border)]"><span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white ${workspace.color}`}><Building2 size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-700">{workspace.name}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{workspace.type} workspace</span></span><ChevronDown size={15} className={`text-slate-400 transition-transform ${workspaceMenuOpen ? "rotate-180" : ""}`} /></button>{workspaceMenuOpen && <div className="absolute left-0 right-0 top-[68px] z-30 rounded-xl border border-[var(--edge)] bg-white p-2 shadow-[0_12px_30px_rgba(23,32,51,0.12)]"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Switch workspace</p>{workspaces.map((item) => <button key={item.id} onClick={() => switchWorkspace(item.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${item.id === workspaceId ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-slate-600 hover:bg-slate-50"}`}><span className={`h-2 w-2 rounded-full ${item.color}`} />{item.name}<span className="ml-auto text-[9px] uppercase text-slate-400">{item.type}</span></button>)}<div className="my-1 border-t border-[var(--edge-soft)]" /><input value={workspaceDraft} onChange={(event) => setWorkspaceDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createWorkspace()} placeholder="New workspace name" className="w-full rounded-lg border border-[var(--edge)] px-2.5 py-2 text-xs outline-none focus:border-[var(--brand-border)]" /><div className="mt-2 grid grid-cols-2 gap-1"><button onClick={() => setWorkspaceDraftType("Personal")} className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Personal" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-slate-50 text-slate-400"}`}>Personal</button><button onClick={() => setWorkspaceDraftType("Team")} className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Team" ? "bg-[var(--violet-soft)] text-[var(--violet-ink)]" : "bg-slate-50 text-slate-400"}`}>Team</button></div><button onClick={createWorkspace} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--ink-solid)] py-2 text-xs font-bold text-white"><Plus size={13} /> Create workspace</button></div>}</div>
              <button onClick={() => createDocument()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_var(--brand-shadow)] transition hover:bg-[var(--violet-dark)]">
                <FilePlus2 size={17} /> New document
              </button>
              <nav className="mt-7 space-y-1">
                <button onClick={() => setActiveSection("current")} className={`sidebar-link ${activeSection === "current" ? "sidebar-link-active" : ""}`}><FileJson2 size={17} /> Current document</button>
                <button onClick={() => setActiveSection("documents")} className={`sidebar-link ${activeSection === "documents" ? "sidebar-link-active" : ""}`}><FolderOpen size={17} /> My documents</button>
              </nav>
              <div className="mt-9 border-t border-[var(--edge-soft)] pt-5">
                <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent</p>
                {documents.map((document) => <button key={document.name} onClick={() => openDocument(document.name, document.content)} className={`recent-link ${documentName === document.name ? "bg-[var(--brand-soft-hover)] text-[var(--brand)]" : ""}`}><span className={`h-2 w-2 rounded-full ${document.name.includes("webhook") ? "bg-[var(--amber-dot)]" : "bg-[var(--brand)]"}`} /> {document.name}</button>)}
              </div>
              <div className="mt-auto rounded-xl bg-[var(--violet-soft-bg)] px-4 py-4 text-sm text-[var(--violet-ink)]">
                <Sparkles size={18} className="mb-2" />
                <p className="font-bold">Keep context close.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--violet-muted)]">Notes stay attached to the structure they explain.</p>
              </div>
            </aside>
          )}
          {!leftCollapsed && <div onPointerDown={startDrag("left")} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} className="group absolute right-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"><div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[var(--brand-border)] group-active:bg-[var(--brand)]" /><GripVertical size={12} className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[var(--brand-border)] group-hover:block" /></div>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-[var(--edge)] bg-white px-5 py-3.5 xl:flex-row xl:items-center xl:justify-between xl:px-7">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                <span className="flex items-center gap-1 font-medium text-slate-500">
                  <FileJson2 size={15} className="text-[var(--brand)]" />
                  {workspace.name}
                </span>
                <span className="text-slate-300">/</span>
                <span className="font-medium text-slate-500">{activeSection === "documents" ? "My documents" : "Workspace"}</span>
                <span className="text-slate-300">/</span>
                <div className="group flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 transition-all hover:border-[var(--brand-border)] hover:bg-white focus-within:border-[var(--brand)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--brand-ring)]" title="Click to rename document">
                  <input
                    aria-label="Document name"
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    className="min-w-0 max-w-[200px] truncate bg-transparent font-semibold text-slate-800 outline-none"
                    placeholder="Document name"
                  />
                  <Pencil size={12} className="shrink-0 text-slate-400 opacity-60 group-hover:opacity-100" />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {status === "valid" ? (
                  <div className="flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-0.5 text-xs font-bold text-emerald-700 shadow-xs">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    </span>
                    Valid JSON
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-2.5 py-0.5 text-xs font-bold text-rose-700 shadow-xs">
                    <AlertCircle size={13} className="shrink-0 text-rose-600" />
                    Invalid JSON
                  </div>
                )}

                {formatMessage ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand)]">
                    <Sparkles size={13} /> {formatMessage}
                  </span>
                ) : status === "invalid" ? (
                  <span className="text-xs font-medium text-rose-500">Click Format to auto-repair malformed structure</span>
                ) : (
                  <span className="text-xs text-slate-400">Click Format to repair & pretty-print</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={saveDocument} title="Save Document to Workspace" className="tool-button">
                <Check size={16} /> Save
              </button>
              <button onClick={formatJson} title="Format & Auto-Repair JSON (pretty-print)" className="tool-button">
                <WandSparkles size={16} /> Format
              </button>
              <button onClick={() => setCompareOpen((current) => !current)} title="Compare with another document" className={`tool-button ${compareOpen ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]" : ""}`}>
                <GitCompare size={16} /> Compare
              </button>
              <button onClick={openHistory} title="View Revision History" className="tool-button">
                <HistoryIcon size={16} /> History
              </button>
              <button onClick={minifyJson} title="Minify JSON payload" className="tool-button">
                <Code2 size={16} /> Minify
              </button>
              <button onClick={() => shareLink(compareOpen)} title="Copy compressed URL snapshot link (contains JSON + Notes + Diffs)" className="tool-button border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)] font-bold shadow-2xs hover:bg-[var(--brand)] hover:text-white transition-all active:scale-95">
                <Camera size={16} /> Share Snapshot
              </button>
              <input ref={fileInputRef} type="file" accept=".json,.jsonote,.csv,.txt,application/json,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ""; }} />
              <div className="relative">
                <button onClick={(event) => { event.stopPropagation(); setMoreOpen((current) => !current); }} className={`tool-button ${moreOpen ? "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]" : ""}`} aria-label="More tools">
                  <MoreHorizontal size={16} /> More
                </button>
                {moreOpen && (
                  <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-11 z-40 w-64 rounded-xl border border-[var(--edge)] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]">
                    <button onClick={() => { fileInputRef.current?.click(); setMoreOpen(false); }} className="menu-item"><Upload size={15} className="text-[var(--brand)]" /> Import file<span className="menu-hint">.json / .csv / .txt</span></button>
                    <button onClick={() => { exportCsv(); setMoreOpen(false); }} className="menu-item"><FileSpreadsheet size={15} className="text-[var(--brand)]" /> Convert to CSV<span className="menu-hint">download as .csv</span></button>
                    <button onClick={() => { copyJson(); setMoreOpen(false); }} className="menu-item">{copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} className="text-[var(--brand)]" />} Copy JSON<span className="menu-hint">to clipboard</span></button>
                    <button onClick={() => { downloadJson(); setMoreOpen(false); }} className="menu-item"><Download size={15} className="text-[var(--brand)]" /> Download .json{notes.length > 0 && <span className="menu-hint">with comments</span>}</button>
                    {notes.length > 0 && (
                      <button onClick={() => { downloadPlainJson(); setMoreOpen(false); }} className="menu-item"><FileText size={15} className="text-[var(--brand)]" /> Download plain .json<span className="menu-hint">without comments</span></button>
                    )}
                    <div className="my-1 border-t border-[var(--edge-soft)]" />
                    <button onClick={() => { setSortOpen(true); setMoreOpen(false); }} className="menu-item"><ArrowUpDown size={15} className="text-[var(--brand)]" /> Sort JSON<span className="menu-hint">by field or key</span></button>
                    <button onClick={() => { setSchemaOpen(true); setMoreOpen(false); }} className="menu-item"><ShieldCheck size={15} className="text-[var(--brand)]" /> Validate schema<span className="menu-hint">JSON Schema</span></button>
                    <button onClick={() => { setCodegenOpen(true); setMoreOpen(false); if (!codegenOutput) runCodegen(); }} className="menu-item"><FileCode2 size={15} className="text-[var(--brand)]" /> Generate code<span className="menu-hint">TS, Python, Go…</span></button>
                    <button onClick={() => { setConvertOpen(true); setMoreOpen(false); setConvertDirection("to"); setTimeout(runConvert, 0); }} className="menu-item"><FileJson2 size={15} className="text-[var(--brand)]" /> Convert format<span className="menu-hint">YAML · XML · TOML</span></button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {sharedBanner && (
            <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-3 lg:mx-6">
              <Share2 size={16} className="text-[var(--brand)]" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--brand)]">
                Shared with you
                <span className="ml-2 font-normal text-slate-500">
                  {sharedBanner.hasCompare
                    ? differences === null
                      ? "This session includes a comparison — open Compare to see the differences."
                      : differences.length
                        ? `${differences.length} value${differences.length === 1 ? "" : "s"} differ between the two documents. Open Compare to review.`
                        : "The two documents match."
                    : "Loaded the shared document."}
                  {sharedBanner.noteCount > 0 && ` ${sharedBanner.noteCount} reference note${sharedBanner.noteCount === 1 ? "" : "s"} included.`}
                </span>
              </p>
              {sharedBanner.hasCompare && !compareOpen && (
                <button onClick={() => { setCompareOpen(true); setView("editor"); }} className="tool-button h-8 shrink-0 border-[var(--brand-border)] bg-white px-3 text-[11px] text-[var(--brand)]"><GitCompare size={14} /> Open Compare</button>
              )}
              <button onClick={() => setSharedBanner(null)} className="shrink-0 rounded-lg p-1.5 text-[var(--brand)] hover:bg-white/60" aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-5 p-4 lg:flex-row lg:p-6">
            <section className={fullscreen ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" : "relative flex h-[calc(100vh-130px)] min-h-[580px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--edge)] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]"}>
              {activeSection === "documents" && <div className="absolute inset-0 z-20 overflow-auto bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xl font-bold tracking-[-0.03em] text-slate-800">My documents</p><p className="mt-1 text-sm text-slate-400">Saved JSON files in {workspace.name}. Switch workspaces from the left panel.</p></div><button onClick={() => createDocument()} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white"><FilePlus2 size={15} /> New document</button></div><div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>{documents.map((document) => <button key={document.name} onClick={() => openDocument(document.name, document.content)} className="group min-w-0 rounded-xl border border-[var(--edge)] p-4 text-left transition hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft-hover)]"><div className="flex items-center justify-between"><FileJson2 size={20} className="text-[var(--brand)]" /><ChevronDown size={15} className="-rotate-90 text-slate-300 transition group-hover:text-[var(--brand)]" /></div><p className="mt-5 truncate text-sm font-bold text-slate-700">{document.name}</p><p className="mt-1 text-xs text-slate-400">Updated {document.updated}</p></button>)}</div></div>}
              {compareOpen && (
                <div className="absolute inset-0 z-10 flex flex-col bg-white">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--edge)] px-5 py-3">
                    <div className="min-w-[200px] flex-1">
                      <p className="text-sm font-bold text-slate-700">Compare JSON</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Both sides are editable — changes highlight live. <span className="rounded bg-amber-100 px-1">changed</span> <span className="rounded bg-rose-100 px-1">removed</span> <span className="rounded bg-emerald-100 px-1">added</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={copyReport} className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"><Copy size={14} /> Copy report</button>
                      <button onClick={exportReport} className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"><Download size={14} /> Export report</button>
                      <button onClick={() => shareLink(true)} className="tool-button h-8 shrink-0 whitespace-nowrap border-[var(--brand-border)] bg-[var(--brand-soft)] px-2.5 text-[11px] text-[var(--brand)]"><Share2 size={14} /> Share comparison</button>
                      <button onClick={() => setCompareOpen(false)} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close compare"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="grid flex-1 gap-4 overflow-auto p-4 pb-8 xl:grid-cols-2">
                    <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[var(--edge)]">
                      <div className="flex items-center justify-between border-b border-[var(--edge)] px-4 py-2.5 text-xs font-bold text-slate-600">
                        <span>Current JSON — {documentName}</span>
                        {!compareValidity.leftValid && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">Syntax error</span>
                        )}
                      </div>
                      <ComparePane value={json} onChange={updateJson} statuses={diffStatuses.left} editorRef={compareCurrentRef} ariaLabel="Current JSON comparison" />
                    </div>
                    <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[var(--brand-border)]">
                      <div className="flex items-center justify-between border-b border-[var(--brand-soft-border)] bg-[var(--brand-soft-hover)] px-4 py-2.5 text-xs font-bold text-[var(--brand)]">
                        <span>Compare with</span>
                        {!compareValidity.rightValid && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">Syntax error</span>
                        )}
                      </div>
                      <ComparePane value={compareJson} onChange={setCompareJson} statuses={diffStatuses.right} editorRef={compareRef} ariaLabel="Compare JSON" />
                    </div>
                    <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4 xl:col-span-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-700">
                          Differences Breakdown
                          <span className="ml-2 text-xs font-normal text-slate-400">Click any row to jump directly to it in both editor panes</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${!compareValidity.bothValid ? "border-rose-200 bg-rose-50 text-rose-700" : pathDiffs.length ? "border-amber-200/80 bg-amber-50 text-amber-700" : "border-emerald-200/80 bg-emerald-50 text-emerald-700"}`}>
                            {!compareValidity.bothValid
                              ? !compareValidity.leftValid && !compareValidity.rightValid
                                ? "Both documents have syntax errors"
                                : !compareValidity.leftValid
                                ? "Current JSON has syntax errors"
                                : "Compared JSON has syntax errors"
                              : pathDiffs.length
                              ? `${pathDiffs.filter((d) => d.kind === "changed").length} changed · ${pathDiffs.filter((d) => d.kind === "added").length} added · ${pathDiffs.filter((d) => d.kind === "removed").length} removed`
                              : "No changes"}
                          </span>
                          {!compareValidity.bothValid && (
                            <button onClick={autoFixCompareSyntax} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-xs transition-all hover:bg-rose-700 active:scale-95">
                              <WandSparkles size={13} /> Auto-fix syntax & format
                            </button>
                          )}
                        </div>
                      </div>
                      {pathDiffs.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {pathDiffs.map((difference) => {
                            const targetRow = changedRows.find((row) => row.leftText.includes(`"${difference.path.split(".").pop()?.replace(/\[\d+\]/, "")}"`) || row.rightText.includes(`"${difference.path.split(".").pop()?.replace(/\[\d+\]/, "")}"`));
                            const lineInfo = targetRow ? (targetRow.leftLine ? `L${targetRow.leftLine}` : `L${targetRow.rightLine}`) : "";
                            return (
                              <button
                                key={difference.path}
                                onClick={() => targetRow && jumpToCompareLine(targetRow.leftLine ?? targetRow.rightLine ?? 1, targetRow.rightLine ?? targetRow.leftLine ?? 1)}
                                className="grid w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left text-xs transition-all hover:border-[var(--brand-border)] hover:bg-slate-50/80 sm:grid-cols-[75px_65px_1fr_1fr_1fr]"
                              >
                                <span className={`rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide ${difference.kind === "added" ? "bg-emerald-50 text-emerald-700" : difference.kind === "removed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                                  {difference.kind}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-400">{lineInfo ? `${lineInfo}` : ""}</span>
                                <span className="break-all font-mono font-semibold text-[var(--brand)]">{difference.path}</span>
                                <span className="break-all font-mono text-[11px] text-rose-600">− {difference.before}</span>
                                <span className="break-all font-mono text-[11px] text-emerald-600">+ {difference.after}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">
                          {!compareValidity.bothValid
                            ? !compareValidity.leftValid && !compareValidity.rightValid
                              ? "Fix syntax errors on both sides (or hit Format) to see path-level differences."
                              : !compareValidity.leftValid
                              ? "Fix syntax errors in Current JSON (or hit Format) to see path-level differences."
                              : "Fix syntax errors in Compared JSON (or hit Format) to see path-level differences."
                            : "The two JSON documents match perfectly."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-[var(--edge)] px-5 py-3">
                <div className="flex items-center gap-4"><button onClick={() => { setView("editor"); setCompareOpen(false); }} className={view === "editor" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Editor</button><button onClick={() => { setView("tree"); setCompareOpen(false); }} className={view === "tree" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Tree view</button><button onClick={() => { setView("query"); setCompareOpen(false); }} className={view === "query" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Query</button><button onClick={() => { setView("table"); setCompareOpen(false); }} className={view === "table" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Table</button><button onClick={() => { setView("graph"); setCompareOpen(false); }} className={view === "graph" ? "tab-active" : "text-sm font-semibold text-slate-400 hover:text-slate-700"}>Graph</button></div>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-400"><span>{lineCount} lines</span><button onClick={() => setFullscreen((current) => !current)} className="text-slate-500 hover:text-slate-900" aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div>
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--surface-soft)]">
                {view === "query" ? <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden">
                  <div className="border-b border-[var(--edge)] bg-[var(--surface-soft)] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <TerminalSquare size={16} className="absolute left-3.5 top-3 text-[var(--brand)]" />
                        <input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="e.g. endpoints[?auth=true].name" spellCheck={false} className="w-full rounded-xl border border-[var(--edge)] bg-white py-2.5 pl-10 pr-24 font-mono text-sm shadow-sm outline-none transition focus:border-[var(--brand-border)] focus:shadow-[0_0_0_3px_rgba(15,118,110,0.08)]" />
                        <span className={`absolute right-3 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${queryResults.error ? "bg-rose-50 text-rose-600" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}>{queryResults.error ? "invalid doc" : `${queryResults.matches.length.toLocaleString()} match${queryResults.matches.length === 1 ? "" : "es"}`}</span>
                      </div>
                      {queryResults.matches.length > 0 && <button onClick={async () => { const payload = queryResults.matches.length === 1 ? queryResults.matches[0].value : queryResults.matches.map((m) => m.value); if (await copyText(JSON.stringify(payload, null, 2))) toast.success("Query result copied as JSON"); }} className="tool-button h-10 shrink-0"><Copy size={14} /> Copy result</button>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Try:</span>
                      {["endpoints[*].name", "endpoints[?auth=true].path", "settings.*", "endpoints[0]"].map((example) => <button key={example} onClick={() => setQueryText(example)} className={`rounded-md px-2 py-1 font-mono text-[10px] transition ${queryText === example ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"}`}>{example}</button>)}
                      <span className="ml-auto hidden text-[10px] text-slate-400 sm:block">dot paths · [index] · [*] · [?field=value] · &gt; &lt; !=</span>
                    </div>
                  </div>
                  <div className="grid flex-1 overflow-hidden lg:grid-cols-2">
                    <div className="flex min-h-[240px] flex-col overflow-hidden border-b border-[var(--edge)] lg:border-b-0 lg:border-r">
                      <div className="flex items-center justify-between border-b border-[var(--edge)] bg-white px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Document — {documentName}</span><span className="text-[10px] text-slate-400">{lineCount.toLocaleString()} lines</span></div>
                      <pre className="flex-1 overflow-auto bg-[var(--surface-soft)] p-4 font-mono text-xs leading-6 text-[var(--ink)]">{json}</pre>
                    </div>
                    <div className="flex min-h-[240px] flex-col overflow-hidden">
                      <div className="flex items-center justify-between border-b border-[var(--edge)] bg-white px-4 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Results</span>{queryResults.matches.length > queryLimit && <span className="text-[10px] text-slate-400">showing {queryLimit.toLocaleString()} of {queryResults.matches.length.toLocaleString()}</span>}</div>
                      <div className="flex-1 space-y-2.5 overflow-auto bg-[var(--surface-soft)] p-4">
                        {queryResults.error && <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">{queryResults.error}</div>}
                        {!queryResults.error && queryResults.matches.slice(0, queryLimit).map((match) => <div key={match.path} className="rounded-xl border border-[var(--edge-soft)] bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="break-all font-mono text-[10px] font-bold text-[var(--brand)]">{match.path}</p><button onClick={async () => { if (await copyText(JSON.stringify(match.value, null, 2))) toast.success("Copied"); }} className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-slate-50 hover:text-[var(--brand)]" aria-label="Copy this value"><Copy size={12} /></button></div>{typeof match.value === "string" && /^https?:\/\/\S+$/i.test(match.value) ? <a href={match.value} target="_blank" rel="noopener noreferrer" className="mt-1.5 block break-all font-mono text-xs leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{match.value}</a> : <pre className="mt-1.5 max-h-64 overflow-auto font-mono text-xs leading-5 text-slate-600">{previewValue(match.value)}</pre>}</div>)}
                        {!queryResults.error && queryResults.matches.length > queryLimit && <button onClick={() => setQueryLimit((current) => current + 100)} className="w-full rounded-xl border border-dashed border-[var(--brand-border)] py-2.5 text-xs font-bold text-[var(--brand)] transition hover:bg-[var(--brand-soft-hover)]">Show 100 more</button>}
                        {!queryResults.error && queryResults.matches.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No matches for this query.</p>}
                      </div>
                    </div>
                  </div>
                </div> : view === "graph" ? <JsonGraph json={json} dark={isDark} onUpdateJson={(value) => { updateJson(value); setFormatMessage(""); }} /> : view === "table" ? <TableView json={json} onChange={(value) => { updateJson(value); setFormatMessage(""); }} /> : view === "tree" ? <div className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2"><div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Braces size={15} className="text-[var(--brand)]" /> Interactive structure <span className="hidden sm:inline">• click a value to edit it</span></div><div className="ml-auto flex items-center gap-1"><span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Levels:</span>{[1, 2, 3].map((level) => <button key={level} onClick={() => setTreeDepth(level)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === level ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}>{level}</button>)}<button onClick={() => setTreeDepth(99)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 99 ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}>Expand all</button><button onClick={() => setTreeDepth(0)} className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 0 ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}>Collapse all</button></div></div><div className="min-h-0 flex-1 overflow-auto p-5">{status === "valid" ? <JsonTree key={`depth-${treeDepth}`} label="root" value={JSON.parse(json)} openDepth={treeDepth} onEdit={handleTreeEdit} /> : <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">Fix the JSON syntax to view the tree.</div>}</div></div> : <JsonCodeEditor ref={cmRef} value={json} onChange={(value) => { updateJson(value); setFormatMessage(""); }} noteLines={notes.map((note) => note.line)} onNoteClick={(line) => { const target = notes.find((note) => note.line === line); if (target) jumpToNote(target); }} onContextMenu={(line, x, y) => setContextMenu({ x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 80), line })} dark={isDark} />}
                {view === "editor" && <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-[var(--edge)] bg-white/95 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm"><span className={`h-1.5 w-1.5 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`} /> UTF-8 <span className="text-slate-300">•</span> Spaces: 2</div>}
                {contextMenu && view === "editor" && <div onClick={(event) => event.stopPropagation()} className="fixed z-50 w-52 rounded-xl border border-[var(--edge)] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={() => openCommentComposer(contextMenu.line)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MessageSquarePlus size={15} className="text-[var(--brand)]" /> Add comment on line {contextMenu.line}</button></div>}
              </div>
            </section>

            <div className="relative hidden lg:flex">
              {!rightCollapsed && <div onPointerDown={startDrag("right")} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag} className="group absolute left-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"><div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[var(--brand-border)] group-active:bg-[var(--brand)]" /><GripVertical size={12} className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[var(--brand-border)] group-hover:block" /></div>}
              {rightCollapsed ? (
                <div className="flex w-11 shrink-0 flex-col items-center gap-3 rounded-2xl border border-[var(--edge)] bg-white py-5 shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
                  <button onClick={() => setRightCollapsed(false)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="Expand notes panel" title="Expand notes panel"><PanelRightOpen size={18} /></button>
                  <div className="h-px w-6 bg-[var(--edge-soft)]" />
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--brand-soft)] text-[10px] font-bold text-[var(--brand)]">{notes.length}</span>
                  <button onClick={() => { setRightCollapsed(false); openCommentComposer(); }} className="rounded-lg p-2 text-[var(--brand)] transition hover:bg-[var(--brand-soft)]" aria-label="Add reference note" title="Add reference note"><MessageSquarePlus size={18} /></button>
                </div>
              ) : (
                <aside style={{ width: rightWidth }} className="flex h-[calc(100vh-130px)] min-h-[580px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--edge)] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
                  <div className="border-b border-[var(--edge)] px-5 pb-4 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-bold tracking-[-0.025em] text-slate-800">Reference notes</p>
                        <p className="mt-1 text-xs text-slate-400">Context for future you.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[var(--brand-soft)] px-1 text-xs font-bold text-[var(--brand)] shadow-2xs">
                          {notes.length}
                        </span>
                        <button onClick={() => setRightCollapsed(true)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-[var(--brand)]" aria-label="Collapse notes panel" title="Collapse notes panel">
                          <PanelRightClose size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="relative mt-4">
                      <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes…" className="w-full rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] py-2 pl-9 pr-3 text-xs outline-none transition focus:border-[var(--brand-border)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-ring)]" />
                    </div>
                    <div className="mt-3 flex items-center gap-1">
                      {([["all", "All", notes.length], ["open", "Open", openNoteCount], ["resolved", "Resolved", notes.length - openNoteCount]] as const).map(([value, label, count]) => (
                        <button key={value} onClick={() => setNoteFilter(value)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${noteFilter === value ? "bg-[var(--brand)] text-white shadow-xs" : "bg-[var(--surface-soft)] text-slate-500 hover:bg-slate-200/60 hover:text-[var(--brand)]"}`}>
                          {label} {count}
                        </button>
                      ))}
                      {notes.length > 0 && (
                        <button onClick={exportReview} className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-[var(--brand-soft-hover)] hover:text-[var(--brand)]" title="Export review as markdown">
                          <Download size={12} /> Review
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3.5 overflow-auto p-4">
                    {visibleNotes.map((note) =>
                      editingNoteId === note.id ? (
                        <div key={note.id} className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft-hover)] p-4 shadow-sm">
                          <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
                            <Pencil size={12} /> Editing comment on line {commentLine}
                          </div>
                          <input autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400" />
                          <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What should you remember?" className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 text-slate-600 outline-none placeholder:text-slate-400" />
                          <input value={noteMention} onChange={(event) => setNoteMention(event.target.value)} placeholder="Mention a name (optional)" className="mt-1 w-full border-b border-[var(--brand-soft-border)] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400" />
                          <div className="mt-3 flex justify-end gap-2">
                            <button onClick={() => { setEditingNoteId(null); setNoteTitle(""); setNoteText(""); setNoteMention(""); }} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors">
                              Cancel
                            </button>
                            <button onClick={addNote} className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer">
                              <Check size={13} /> Update note
                            </button>
                          </div>
                        </div>
                      ) : (
                        <article key={note.id} className={`group relative overflow-hidden rounded-2xl border transition-all hover:shadow-md ${note.resolved ? "border-slate-200/70 bg-slate-50/70 opacity-75" : "border-slate-200 bg-white"}`}>
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${note.resolved ? "bg-emerald-400" : note.color || "bg-amber-400"}`} />

                          <div className="p-4 pl-4.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className={`cursor-pointer text-sm font-bold text-slate-800 transition hover:text-[var(--brand)] ${note.resolved ? "line-through decoration-slate-400" : ""}`} onClick={() => jumpToNote(note)}>
                                    {note.title}
                                  </p>
                                  {note.resolved && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-2xs">
                                      <CircleCheck size={11} /> Resolved
                                    </span>
                                  )}
                                </div>
                                {note.mention && (
                                  <div className="mt-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-md border border-teal-200/80 bg-teal-50/80 px-2 py-0.5 text-[11px] font-bold text-teal-800 shadow-2xs">
                                      <AtSign size={11} className="text-teal-600" />
                                      {note.mention}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 p-0.5 opacity-80 transition group-hover:opacity-100">
                                <button onClick={(event) => { event.stopPropagation(); toggleResolve(note); }} className={`rounded-md p-1.5 transition ${note.resolved ? "bg-emerald-100 text-emerald-700 font-bold" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"}`} aria-label={note.resolved ? "Reopen" : "Resolve"} title={note.resolved ? "Reopen note" : "Mark resolved"}>
                                  <CircleCheck size={14} />
                                </button>
                                <button onClick={(event) => { event.stopPropagation(); setReplyingNoteId(replyingNoteId === note.id ? null : note.id); }} className={`rounded-md p-1.5 transition ${replyingNoteId === note.id ? "bg-teal-100 text-teal-800 font-bold shadow-2xs" : "text-slate-400 hover:bg-teal-50 hover:text-teal-700"}`} aria-label="Reply" title="Reply to thread">
                                  <ReplyIcon size={13} />
                                </button>
                                <button onClick={(event) => { event.stopPropagation(); editNote(note); }} className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700" aria-label="Edit note" title="Edit note">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={(event) => { event.stopPropagation(); setNotes((current) => { const next = current.filter((item) => item.id !== note.id); const docKey = `${workspaceId}:${documentName}`; setDocumentNotes((all) => ({ ...all, [docKey]: next })); return next; }); }} className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Remove note" title="Delete note">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <p className="mt-2.5 text-xs leading-5 text-slate-600">{note.text}</p>

                            {note.replies && note.replies.length > 0 && (
                              <div className="mt-3.5 space-y-2 border-l-2 border-slate-200/80 pl-3">
                                {note.replies.map((reply) => (
                                  <div key={reply.id} className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-2.5 shadow-2xs">
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                      <CornerDownRight size={12} className="shrink-0 text-slate-400" />
                                      <span>
                                        {reply.mention && (
                                          <span className="inline-flex items-center gap-0.5 font-bold text-[var(--brand)]">
                                            @{reply.mention}{" "}
                                          </span>
                                        )}
                                        {reply.text}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {replyingNoteId === note.id && (
                              <div className="mt-3 rounded-2xl border border-teal-200 bg-slate-50/90 p-3 shadow-sm ring-2 ring-teal-500/10">
                                <textarea autoFocus value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Write a reply…" className="min-h-14 w-full resize-none bg-transparent text-xs leading-5 text-slate-700 outline-none placeholder:text-slate-400" />
                                <input value={replyMention} onChange={(event) => setReplyMention(event.target.value)} placeholder="Mention (optional)" className="mt-1 w-full border-b border-slate-200 bg-transparent py-1 text-xs outline-none placeholder:text-slate-400 focus:border-teal-500" />
                                <div className="mt-2.5 flex justify-end gap-2">
                                  <button onClick={() => { setReplyingNoteId(null); setReplyText(""); setReplyMention(""); }} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors">
                                    Cancel
                                  </button>
                                  <button onClick={() => addReply(note.id)} className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer">
                                    <ReplyIcon size={13} /> Reply
                                  </button>
                                </div>
                              </div>
                            )}

                            <button onClick={() => jumpToNote(note)} className="mt-3.5 flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold transition-all hover:border-[var(--brand-border)] hover:bg-white hover:shadow-2xs group">
                              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[var(--brand)]">
                                <Code2 size={13} className="text-[var(--brand)]" />
                                {note.path}
                              </span>
                              <span className="flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wide text-slate-400 transition-colors group-hover:text-[var(--brand)]">
                                Line {note.line}
                                <ChevronDown size={13} className="-rotate-90 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </button>
                          </div>
                        </article>
                      )
                    )}

                    {visibleNotes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No matching notes.</p>}

                    {showComposer && !editingNoteId ? (
                      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft-hover)] p-4 shadow-sm">
                        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
                          <MessageSquare size={13} /> Comment on line {commentLine}
                        </div>
                        <input autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400" />
                        <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What should you remember?" className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400" />
                        <input value={noteMention} onChange={(event) => setNoteMention(event.target.value)} placeholder="Mention a name (optional)" className="mt-2 w-full border-b border-[var(--brand-soft-border)] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400" />
                        <div className="mt-3 flex justify-end gap-2">
                          <button onClick={() => { setShowComposer(false); setEditingNoteId(null); }} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors">
                            Cancel
                          </button>
                          <button onClick={addNote} className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer">
                            <Check size={13} /> {editingNoteId ? "Update note" : "Save note"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => openCommentComposer()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-soft)]/40 py-3.5 text-xs font-bold text-[var(--brand)] transition-all hover:bg-[var(--brand-soft)] hover:shadow-2xs active:scale-[0.99]">
                        <MessageSquarePlus size={16} /> Add reference note
                      </button>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Modern Developer-Focused Footer */}
      <footer className="relative overflow-hidden border-t border-[var(--edge)] bg-[var(--surface-soft)] text-slate-600 dark:text-slate-400">
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-12 lg:px-12">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-5">
            {/* Brand Column */}
            <div className="space-y-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-white shadow-md">
                  <Braces size={20} />
                </span>
                <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  JSONote
                </span>
                <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
                  BETA
                </span>
              </div>
              <p className="max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                A fast, secure, and 100% client-side JSON editor, formatter, and line-annotation tool designed for modern engineering teams.
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                <span>Made with <Heart size={13} className="inline fill-rose-500 text-rose-500" /> for developers worldwide</span>
              </div>
              {/* Communication Links */}
              <div className="flex items-center gap-2 pt-2">
                {[
                  { icon: Mail, label: "Direct Email", href: "https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=JSONote%20Inquiry" },
                  { icon: MessageCircle, label: "WhatsApp Support", href: "https://wa.me/919398548188" },
                  { icon: Phone, label: "Direct Call", href: "tel:+919398548188" },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={item.label}
                    title={item.label}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--edge)] bg-white text-slate-500 transition hover:border-[var(--brand-border)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] dark:bg-[var(--surface)] dark:text-slate-300"
                  >
                    <item.icon size={15} />
                  </a>
                ))}
              </div>
            </div>

            {/* Features Column */}
            <div className="space-y-3 text-xs">
              <h5 className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Product Features</h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li><button onClick={() => setView("editor")} className="hover:text-[var(--brand)]">JSON Editor & Formatter</button></li>
                <li><button onClick={() => setView("tree")} className="hover:text-[var(--brand)]">Interactive Tree View</button></li>
                <li><button onClick={() => setView("graph")} className="hover:text-[var(--brand)]">Visual Node Graph</button></li>
                <li><button onClick={() => setCompareOpen(true)} className="hover:text-[var(--brand)]">Side-by-Side Compare</button></li>
                <li><button onClick={() => setSchemaOpen(true)} className="hover:text-[var(--brand)]">JSON Schema Generator</button></li>
                <li><button onClick={() => setCodegenOpen(true)} className="hover:text-[var(--brand)]">Multi-Language Codegen</button></li>
              </ul>
            </div>

            {/* Tools & Conversions Column */}
            <div className="space-y-3 text-xs">
              <h5 className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Tools & Conversions</h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li><button onClick={() => { setConvertFormatId("yaml"); setConvertOpen(true); }} className="hover:text-[var(--brand)]">JSON to YAML Converter</button></li>
                <li><button onClick={() => { setConvertFormatId("xml"); setConvertOpen(true); }} className="hover:text-[var(--brand)]">JSON to XML Converter</button></li>
                <li><button onClick={() => { setConvertFormatId("toml"); setConvertOpen(true); }} className="hover:text-[var(--brand)]">JSON to TOML Converter</button></li>
                <li><button onClick={() => formatJson()} className="hover:text-[var(--brand)]">Auto-Repair Broken JSON</button></li>
                <li><button onClick={() => setSortOpen(true)} className="hover:text-[var(--brand)]">Sort Keys & Values</button></li>
                <li><button onClick={() => shareLink(compareOpen)} className="hover:text-[var(--brand)]">Session Snapshot Link</button></li>
              </ul>
            </div>

            {/* Connect & Support Column */}
            <div className="space-y-3 text-xs">
              <h5 className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Connect & Support</h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li><button onClick={() => { setHelpTab("query"); setHelpOpen(true); }} className="hover:text-[var(--brand)]">Submit a Query</button></li>
                <li><button onClick={() => { setHelpTab("contact"); setHelpOpen(true); }} className="hover:text-[var(--brand)]">Get in Touch</button></li>
                <li><button onClick={() => { setHelpTab("faq"); setHelpOpen(true); }} className="hover:text-[var(--brand)]">Shortcuts & FAQ</button></li>
                <li><a href="https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=JSONote%20Inquiry" target="_blank" rel="noreferrer" className="font-mono text-[11px] hover:text-[var(--brand)]">chennadvp7799@gmail.com</a></li>
                <li><a href="https://wa.me/919398548188" target="_blank" rel="noreferrer" className="font-mono text-[11px] hover:text-[var(--brand)]">+91 9398548188</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--edge-soft)] pt-6 text-xs text-slate-400 sm:flex-row">
            <p>© {new Date().getFullYear()} JSONote. All rights reserved. 100% Client-side privacy.</p>
            <div className="flex items-center gap-4 text-[11px]">
              <button onClick={() => { setHelpTab("faq"); setHelpOpen(true); }} className="hover:text-[var(--brand)]">Client-Side Privacy</button>
              <span>•</span>
              <button onClick={() => { setHelpTab("contact"); setHelpOpen(true); }} className="hover:text-[var(--brand)]">Direct Support</button>
            </div>
          </div>
        </div>

        {/* Large Subtle Background Watermark */}
        <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 select-none text-[70px] font-black tracking-widest text-slate-200/40 dark:text-slate-800/20 sm:text-[110px] md:text-[140px]">
          JSONote
        </div>
      </footer>

      {/* Product Walkthrough / Tour Modal */}
      {tourOpen && (
        <div onClick={() => setTourOpen(false)} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-[94vw] max-w-4xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]">
            <div className="flex items-center justify-between border-b border-[var(--edge)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">JSONote Features Walkthrough</h3>
                  <p className="text-xs text-slate-400">Explore core features designed for high-productivity JSON editing and review.</p>
                </div>
              </div>
              <button onClick={() => setTourOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 overflow-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
              {/* Feature 1 */}
              <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--brand)]">
                    <WandSparkles size={16} /> 1. Smart Editor & Repair
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Real-time syntax validation, line numbers, error markers, and 1-click auto-repair for trailing commas & unquoted keys.
                  </p>
                </div>
                <button onClick={() => { formatJson(); setTourOpen(false); }} className="mt-4 tool-button w-full justify-center text-[var(--brand)]">
                  Try Auto-Repair
                </button>
              </div>

              {/* Feature 2 */}
              <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400">
                    <MessageSquarePlus size={16} /> 2. Line Notes & @Mentions
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Right-click any line in the JSON editor to attach reference notes, tag team members with `@mention`, and thread replies without corrupting raw JSON.
                  </p>
                </div>
                <button onClick={() => { openCommentComposer(); setTourOpen(false); }} className="mt-4 tool-button w-full justify-center text-violet-600 dark:text-violet-400">
                  Add Line Note
                </button>
              </div>

              {/* Feature 3 */}
              <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-600 dark:text-teal-400">
                    <GitCompare size={16} /> 3. Side-by-Side Diffs
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Compare two JSON documents side-by-side to highlight added, modified, and deleted keys instantly.
                  </p>
                </div>
                <button onClick={() => { setCompareOpen(true); setTourOpen(false); }} className="mt-4 tool-button w-full justify-center text-teal-600 dark:text-teal-400">
                  Open Compare
                </button>
              </div>

              {/* Feature 4 */}
              <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-600 dark:text-sky-400">
                    <TableIcon size={16} /> 4. Tree & Node Graph
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Interactive hierarchy tree and visual SVG node graph where you can zoom, edit, and add/delete properties live.
                  </p>
                </div>
                <button onClick={() => { setView("graph"); setTourOpen(false); }} className="mt-4 tool-button w-full justify-center text-sky-600 dark:text-sky-400">
                  View Node Graph
                </button>
              </div>

              {/* Feature 5 */}
              <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <FileCode2 size={16} /> 5. Schema & Codegen
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Infer Draft-07 JSON Schema and generate type-safe code across TypeScript, Go, Python, Java, C#, Rust, and Swift.
                  </p>
                </div>
                <button onClick={() => { setCodegenOpen(true); setTourOpen(false); runCodegen(); }} className="mt-4 tool-button w-full justify-center text-amber-600 dark:text-amber-400">
                  Generate Code
                </button>
              </div>

              {/* Feature 6 */}
              <div className="flex flex-col justify-between rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <Camera size={16} /> 6. Session Snapshots
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Share your entire workspace (JSON payload + all line notes + replies + compare diffs) via a compressed URL `#s=` link or `.jsonote` file.
                  </p>
                </div>
                <button onClick={() => { shareLink(compareOpen); setTourOpen(false); }} className="mt-4 rounded-lg bg-[var(--brand)] py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]">
                  Copy Share Snapshot
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[var(--edge-soft)] pt-4">
              <span className="text-xs text-slate-400">🔒 100% Client-Side Privacy — Data never leaves your browser.</span>
              <button onClick={() => setTourOpen(false)} className="rounded-lg bg-[var(--brand)] px-5 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">
                Got it, let's edit!
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-[94vw] max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--edge)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <CircleHelp size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Help & Support Center</h3>
                  <p className="text-xs text-slate-400">Ask a question, submit feedback, or connect directly with our team.</p>
                </div>
              </div>
              <button onClick={() => setHelpOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="mt-4 flex border-b border-[var(--edge)]">
              <button
                onClick={() => setHelpTab("query")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${helpTab === "query" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
              >
                <MessageSquarePlus size={15} /> Submit Query
              </button>
              <button
                onClick={() => setHelpTab("contact")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${helpTab === "contact" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
              >
                <Phone size={15} /> Get in Touch
              </button>
              <button
                onClick={() => setHelpTab("faq")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition border-b-2 ${helpTab === "faq" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
              >
                <Code2 size={15} /> Shortcuts & FAQ
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
              {helpTab === "query" && (
                querySubmitted ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <CircleCheck size={36} />
                    </div>
                    <h4 className="mt-4 text-base font-bold text-slate-800 dark:text-white">Query Registered & Email Prepared!</h4>
                    <p className="mt-1 max-w-md text-xs text-slate-500">
                      Reference ID: <span className="font-mono font-bold text-[var(--brand)]">#{queryRefId}</span>. Destination Email:
                    </p>
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--edge)] bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 dark:bg-[var(--surface-soft)] dark:text-slate-200">
                      <Mail size={14} className="text-[var(--brand)]" />
                      <span>chennadvp7799@gmail.com</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyText("chennadvp7799@gmail.com");
                          toast.success("Copied email to clipboard!");
                        }}
                        className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-sans font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <Copy size={11} className="inline mr-1" /> Copy
                      </button>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=${encodeURIComponent(`[JSONote Query #${queryRefId}] ${supportSubject || supportCategory}`)}&body=${encodeURIComponent(`Name: ${supportName}\nEmail: ${supportEmail}\nRef ID: #${queryRefId}\n\n${supportMessage}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                      >
                        <Send size={14} /> Open Gmail Web
                      </a>
                      <a
                        href={`mailto:chennadvp7799@gmail.com?subject=${encodeURIComponent(`[JSONote Query #${queryRefId}] ${supportSubject || supportCategory}`)}&body=${encodeURIComponent(`Name: ${supportName}\nEmail: ${supportEmail}\nRef ID: #${queryRefId}\n\n${supportMessage}`)}`}
                        className="tool-button"
                      >
                        Open Mail App
                      </a>
                      <button onClick={resetSupportForms} className="tool-button">Submit another query</button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleQuerySubmit} className="space-y-4">
                    <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] p-2.5 text-xs text-[var(--brand)]">
                      ℹ️ Queries are prefilled and sent to <span className="font-mono font-bold underline">chennadvp7799@gmail.com</span>.
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Your Name *</label>
                        <input
                          type="text"
                          required
                          value={supportName}
                          onChange={(e) => setSupportName(e.target.value)}
                          placeholder="e.g. Chenna Kumar"
                          className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Email Address *</label>
                        <input
                          type="email"
                          required
                          value={supportEmail}
                          onChange={(e) => setSupportEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Query Category</label>
                        <select
                          value={supportCategory}
                          onChange={(e) => setSupportCategory(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                        >
                          <option value="General Query">General Query</option>
                          <option value="Bug Report">Bug Report</option>
                          <option value="Feature Request">Feature Request</option>
                          <option value="Enterprise / API Inquiry">Enterprise / API Inquiry</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Subject</label>
                        <input
                          type="text"
                          value={supportSubject}
                          onChange={(e) => setSupportSubject(e.target.value)}
                          placeholder="Brief summary of your question"
                          className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">Query Details / Message *</label>
                      <textarea
                        required
                        rows={4}
                        value={supportMessage}
                        onChange={(e) => setSupportMessage(e.target.value)}
                        placeholder="Describe your issue or question in detail..."
                        className="mt-1 w-full resize-none rounded-lg border border-[var(--edge)] bg-white p-3 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={supportIncludeJson}
                        onChange={(e) => setSupportIncludeJson(e.target.checked)}
                        className="rounded border-[var(--edge)] text-[var(--brand)] focus:ring-0"
                      />
                      <span>Attach current JSON document snippet for faster diagnosis (sanitized)</span>
                    </label>

                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white transition hover:bg-[var(--brand-hover)] active:scale-[0.99]"
                    >
                      <Send size={16} /> Submit Query
                    </button>
                  </form>
                )
              )}

              {helpTab === "contact" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Email Option */}
                    <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                            <Mail size={18} className="text-[var(--brand)]" /> Direct Email Support
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Send an email directly to our engineering team.</p>

                        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs dark:bg-[var(--surface)]">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">chennadvp7799@gmail.com</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await copyText("chennadvp7799@gmail.com");
                              toast.success("Copied email to clipboard!");
                            }}
                            className="tool-button px-2 py-1 text-[10px]"
                          >
                            <Copy size={11} /> Copy
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <a
                          href="https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=JSONote%20Inquiry"
                          target="_blank"
                          rel="noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                        >
                          <Send size={13} /> Open Gmail Web
                        </a>
                        <a
                          href="mailto:chennadvp7799@gmail.com?subject=JSONote%20Inquiry"
                          className="flex items-center justify-center gap-1 rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:bg-[var(--surface)] dark:text-slate-200"
                        >
                          <Mail size={13} /> Mail App
                        </a>
                      </div>
                    </div>

                    {/* WhatsApp Option */}
                    <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                          <MessageCircle size={18} className="text-emerald-500" /> WhatsApp Support
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Connect directly on WhatsApp for real-time developer help.</p>

                        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs dark:bg-[var(--surface)]">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">+91 9398548188</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await copyText("9398548188");
                              toast.success("Copied WhatsApp number to clipboard!");
                            }}
                            className="tool-button px-2 py-1 text-[10px]"
                          >
                            <Copy size={11} /> Copy
                          </button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <a
                          href="https://wa.me/919398548188?text=Hi%20JSONote%20Team!%20I%20have%20a%20question%20regarding%20JSONote."
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                        >
                          <ExternalLink size={13} /> WhatsApp Chat
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Phone Call / Callback Option */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                        <Phone size={18} className="text-sky-500" /> Direct Call & Request Callback
                      </div>
                      <a href="tel:+919398548188" className="tool-button px-3.5 py-1.5 text-sky-600 dark:text-sky-400">
                        <Phone size={13} /> Call +91 9398548188
                      </a>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Call us directly at <span className="font-mono font-bold text-slate-700 dark:text-slate-300">+91 9398548188</span> or leave your number below for a scheduled callback.
                    </p>

                    {callbackSubmitted ? (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300">
                        ✓ Callback request received! We will call you at your preferred time window ({callbackTime}).
                      </div>
                    ) : (
                      <form onSubmit={handleCallbackSubmit} className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Your Phone Number *</label>
                            <input
                              type="tel"
                              required
                              value={callbackPhone}
                              onChange={(e) => setCallbackPhone(e.target.value)}
                              placeholder="+91 90000 00000"
                              className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-1.5 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface)] dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Preferred Time Window</label>
                            <select
                              value={callbackTime}
                              onChange={(e) => setCallbackTime(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-1.5 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface)] dark:text-white"
                            >
                              <option value="Morning (9 AM - 12 PM)">Morning (9 AM - 12 PM)</option>
                              <option value="Afternoon (12 PM - 5 PM)">Afternoon (12 PM - 5 PM)</option>
                              <option value="Evening (5 PM - 8 PM)">Evening (5 PM - 8 PM)</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" className="tool-button w-full justify-center text-sky-600 dark:text-sky-400">
                          <Clock size={13} /> Request Callback
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {helpTab === "faq" && (
                <div className="space-y-4">
                  {/* Why JSONote & Differentiation */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                      <Sparkles size={16} className="text-[var(--brand)]" /> Why JSONote? What Makes It Different?
                    </h5>
                    <div className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">🔒 100% Client-Side Privacy</p>
                        <p className="mt-0.5 text-slate-500">Unlike typical formatters that transmit your confidential JSON payloads to remote servers, JSONote executes all formatting, auto-repair, schema validation, and graph generation 100% locally in your browser.</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">💬 Contextual Line Notes & @Mentions</p>
                        <p className="mt-0.5 text-slate-500">Right-click any line in the JSON editor to attach reference notes, tag team members with `@mention`, and thread replies without corrupting or altering the raw JSON payload structure.</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">⚡ Side-by-Side Diffs & Session Snapshots</p>
                        <p className="mt-0.5 text-slate-500">Compare JSON documents with color-coded diff highlights, and share your entire session (including diffs and comments) via compressed URL links or portable `.jsonote` files.</p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">🛠️ Auto-Repair, Schema & Code Generation</p>
                        <p className="mt-0.5 text-slate-500">Auto-fix trailing commas, unquoted keys, single quotes, and missing brackets in 1 click. Infer Draft-07 JSON Schemas and generate type-safe code across TypeScript, Go, Python, Java, C#, Rust, and Swift.</p>
                      </div>
                    </div>
                  </div>

                  {/* Core Use Cases */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                      <Braces size={16} className="text-teal-600" /> Core Developer Use Cases
                    </h5>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">1. API Response Debugging</p>
                        <p className="mt-1 text-slate-500">Quickly format, search, filter via JSONPath, and inspect deep nested API payloads.</p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">2. Config Comparison</p>
                        <p className="mt-1 text-slate-500">Diff production vs staging environments side-by-side to detect missing keys instantly.</p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">3. Team Payload Review</p>
                        <p className="mt-1 text-slate-500">Annotate payload lines with notes and replies before sharing with frontend or backend engineers.</p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">4. Clean Format Conversion</p>
                        <p className="mt-1 text-slate-500">Convert JSON to/from clean CSV and YAML without corrupting data or injecting header metadata.</p>
                      </div>
                    </div>
                  </div>

                  {/* Keyboard Shortcuts */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-white">Keyboard Shortcuts Matrix</h5>
                    <div className="mt-3 space-y-2 text-xs">
                      {[
                        ["Save / download JSON document", "⌘ S / Ctrl S"],
                        ["Format & auto-repair JSON", "Format button"],
                        ["Find & replace in editor", "⌘ F / Ctrl F"],
                        ["Fold or unfold JSON block", "click the ▾ / ▸ arrow"],
                        ["Undo / redo edit action", "⌘ Z / Ctrl Z"],
                        ["Add reference note / comment on line", "Right-click line in editor"],
                        ["Switch between Editor / Tree / Graph", "Click top tab bar"],
                      ].map(([label, keys]) => (
                        <div key={label} className="flex items-center justify-between border-b border-[var(--edge-soft)] pb-2 last:border-0">
                          <span className="text-slate-600 dark:text-slate-300">{label}</span>
                          <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--brand)]">{keys}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sortOpen && (
        <div onClick={() => setSortOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Sort JSON</p><button onClick={() => setSortOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            {sortCandidates.length === 0 && !(status === "valid" && (() => { try { const v = JSON.parse(json); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; } })()) ? (
              <p className="mt-4 text-sm text-slate-500">This document has no array to sort, and isn't a plain object either. Fix the JSON syntax or open a different document.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-400">Sort an array (by field, or its values directly) or sort an object's keys alphabetically.</p>
                <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400">Target</label>
                <select value={sortTargetKey ?? sortCandidates[0]?.key ?? "__root_object__"} onChange={(event) => { setSortTargetKey(event.target.value); setSortField(""); }} className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)]">
                  {sortCandidates.map((c) => <option key={c.key} value={c.key}>{c.key === "root" ? "Root array" : `"${c.key}" array`}</option>)}
                  {(() => { try { const v = JSON.parse(json); return v !== null && typeof v === "object" && !Array.isArray(v); } catch { return false; } })() && <option value="__root_object__">Root object — sort keys A→Z</option>}
                </select>
                {sortTargetKey !== "__root_object__" && (sortCandidates.find((c) => c.key === (sortTargetKey ?? sortCandidates[0]?.key))?.fields.length ?? 0) > 0 && (
                  <>
                    <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-400">Sort by field</label>
                    <select value={sortField} onChange={(event) => setSortField(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)]">
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
                  <button onClick={() => applySort("asc")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white"><ArrowUpDown size={15} /> Sort keys A→Z</button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {schemaOpen && (
        <div onClick={() => setSchemaOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-[92vw] max-w-4xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Validate against JSON Schema</p><button onClick={() => setSchemaOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <p className="mt-1 text-xs text-slate-400">Paste a JSON Schema (draft-07 or newer) — validation runs entirely in your browser, nothing is uploaded.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={generateSchemaFromDoc} className="tool-button h-8 px-2.5 text-xs text-[var(--brand)]">
                <WandSparkles size={13} /> Auto-generate schema from document
              </button>
              <button onClick={loadTestSchema} className="tool-button h-8 px-2.5 text-xs text-slate-600">
                <FileCode2 size={13} /> Load test schema with errors
              </button>
            </div>
            <textarea value={schemaText} onChange={(event) => setSchemaText(event.target.value)} spellCheck={false} className="mt-3 h-[320px] md:h-[380px] w-full resize-none rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] p-3.5 font-mono text-xs leading-5 outline-none focus:border-[var(--brand-border)]" />
            <button onClick={runSchemaValidation} className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--brand-hover)] active:scale-[0.99]"><ShieldCheck size={16} /> Validate current document</button>
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

      {codegenOpen && (
        <div onClick={() => setCodegenOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Generate code from JSON</p><button onClick={() => setCodegenOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <p className="mt-1 text-xs text-slate-400">Typed models generated from your document — runs entirely in your browser, nothing is uploaded.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Language</span>
                <select value={codegenLangIndex} onChange={(event) => { setCodegenLangIndex(Number(event.target.value)); }} className="rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)]">
                  {CODEGEN_LANGUAGES.map((lang, index) => <option key={`${lang.id}-${index}`} value={index}>{lang.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Root type name</span>
                <input value={codegenRootName} onChange={(event) => setCodegenRootName(event.target.value)} placeholder="Root" className="w-40 rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)]" />
              </label>
              <button onClick={runCodegen} disabled={codegenLoading} className="flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{codegenLoading ? <Loader2 size={16} className="animate-spin" /> : <FileCode2 size={16} />} Generate</button>
              {codegenOutput && !codegenLoading && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={copyCode} className="tool-button h-9"><Copy size={14} /> Copy</button>
                  <button onClick={downloadCode} className="tool-button h-9"><Download size={14} /> Download</button>
                </div>
              )}
            </div>
            {codegenError && <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">{codegenError}</div>}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)]">
              {codegenLoading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Generating…</div>
              ) : codegenOutput ? (
                <pre className="overflow-auto p-4 font-mono text-xs leading-5 text-slate-700">{codegenOutput}</pre>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">Choose a language and click Generate.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {convertOpen && (
        <div onClick={() => setConvertOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><p className="text-lg font-bold text-slate-800">Convert format</p><button onClick={() => setConvertOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <p className="mt-1 text-xs text-slate-400">Convert between JSON and YAML, XML, or TOML — entirely in your browser.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-[var(--edge)]">
                <button onClick={() => { setConvertDirection("to"); setConvertOutput(""); setConvertError(""); }} className={`px-3 py-1.5 text-xs font-bold transition ${convertDirection === "to" ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500"}`}>JSON →</button>
                <button onClick={() => { setConvertDirection("from"); setConvertOutput(""); setConvertError(""); }} className={`px-3 py-1.5 text-xs font-bold transition ${convertDirection === "from" ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500"}`}>→ JSON</button>
              </div>
              <select value={convertFormatId} onChange={(event) => { setConvertFormatId(event.target.value as ConvertFormat); setConvertOutput(""); setConvertError(""); }} className="rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)]">
                {CONVERT_FORMATS.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
              </select>
              <button onClick={runConvert} className="flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"><FileJson2 size={16} /> Convert</button>
              {convertOutput && (
                <div className="ml-auto flex items-center gap-2">
                  {convertDirection === "from" && <button onClick={loadConvertIntoEditor} className="tool-button h-9 border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]"><Check size={14} /> Load into editor</button>}
                  <button onClick={copyConvert} className="tool-button h-9"><Copy size={14} /> Copy</button>
                  <button onClick={downloadConvert} className="tool-button h-9"><Download size={14} /> Download</button>
                </div>
              )}
            </div>
            {convertDirection === "from" && (
              <textarea value={convertInput} onChange={(event) => setConvertInput(event.target.value)} placeholder={`Paste ${convertFormatInfo().label} here…`} spellCheck={false} className="mt-3 h-32 w-full resize-none rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] p-3 font-mono text-xs outline-none focus:border-[var(--brand-border)]" />
            )}
            {convertError && <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">{convertError}</div>}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)]">
              {convertOutput ? (
                <pre className="overflow-auto p-4 font-mono text-xs leading-5 text-slate-700">{convertOutput}</pre>
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">{convertDirection === "to" ? "Click Convert to turn the current JSON into " + convertFormatInfo().label + "." : "Paste " + convertFormatInfo().label + " above and click Convert."}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div onClick={() => setHistoryOpen(false)} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div onClick={(event) => event.stopPropagation()} className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800">Version history</p>
                <p className="mt-0.5 text-xs text-slate-400">{documentName} · 30-day retention sweet spot (local)</p>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-teal-200/80 bg-teal-50/70 px-3.5 py-2 text-xs font-semibold text-teal-800">
              <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-teal-600" /> Retention Sweet Spot: Versions from the last 30 days (up to 30 snapshots) are kept locally.</span>
              <span className="font-bold">{historyVersions.length}/30</span>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              {historyVersions.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-slate-400"><HistoryIcon size={22} className="text-[var(--brand)]" />No versions yet. Edits are snapshotted automatically a couple of seconds after you stop typing.</div>
              ) : (
                <div className="space-y-2">
                  {historyVersions.map((version, index) => {
                    const changes = versionDiffCount(version);
                    const isCurrent = index === 0 && version.content === json;
                    return (
                      <div key={version.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--edge)] p-3 transition-colors hover:border-slate-300">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">{relativeTime(version.savedAt)}</span>
                            {isCurrent && <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand)]">current</span>}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">{new Date(version.savedAt).toLocaleString()} · {(version.size / 1024).toFixed(1)} KB · {version.content.split("\n").length} lines{changes !== null && !isCurrent ? ` · ${changes} value${changes === 1 ? "" : "s"} differ from current` : ""}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!isCurrent && (
                            <>
                              <button onClick={() => compareVersion(version)} className="tool-button h-8 px-2.5 text-[11px]"><GitCompare size={13} /> Compare</button>
                              <button onClick={() => restoreVersion(version)} className="tool-button h-8 px-2.5 text-[11px]"><RotateCcw size={13} /> Restore</button>
                            </>
                          )}
                          <button onClick={() => removeSingleVersion(version)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Delete this snapshot" title="Delete this version">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {historyVersions.length > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-[var(--edge-soft)] pt-3">
                <span className="text-[11px] text-slate-400 font-medium">Older versions auto-expire after 30 days.</span>
                <button onClick={clearDocHistory} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} /> Clear history</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-Page Floating Mini-Editor Overlay Widget */}
      {floatingWidgetOpen && (
        <div className="fixed bottom-6 right-6 z-[80] flex h-[380px] w-[340px] flex-col rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
              <PictureInPicture size={15} /> Floating Mini-Editor
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${status === "valid" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"}`}>
                {status === "valid" ? "Valid" : "Invalid"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => formatJson()} className="rounded px-2 py-0.5 text-[10px] font-bold bg-sky-600 text-white hover:bg-sky-500">Format</button>
              <button onClick={() => setFloatingWidgetOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800" aria-label="Close"><X size={14} /></button>
            </div>
          </div>

          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className="mt-2 flex-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-slate-100 outline-none resize-none focus:border-sky-500"
            placeholder="Paste or edit JSON..."
          />

          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>⚡ Synced live with main editor</span>
            <span>{json.split("\n").length} lines</span>
          </div>
        </div>
      )}
    </main>
  );
}
