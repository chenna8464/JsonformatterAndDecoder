import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  Braces,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  Code2,
  Copy,
  CornerDownRight,
  Download,
  ExternalLink,
  FileCode2,
  FileJson2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompare,
  Globe,
  GripVertical,
  History as HistoryIcon,
  Laptop,
  Loader2,
  Mail,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  PictureInPicture,
  Plus,
  Reply as ReplyIcon,
  RotateCcw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Table as TableIcon,
  TerminalSquare,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";

const initialJson = "{\n  \n}";

/**
 * Largest file the editor will open.
 *
 * 25 MB of JSON is already an unpleasant editing experience and well past what
 * anyone reads by hand. The value is a responsiveness ceiling, not a judgement
 * about what data is reasonable.
 */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

type Reply = { id: number; text: string; mention: string; at: number };
type Note = {
  id: number;
  title: string;
  text: string;
  path: string;
  line: number;
  mention: string;
  color: string;
  resolved?: boolean;
  replies?: Reply[];
};
type DocumentRecord = { name: string; content: string; updated: string };
type Workspace = {
  id: number;
  name: string;
  type: "Personal" | "Team";
  color: string;
};

import JsonCodeEditor, {
  type JsonCodeEditorHandle,
} from "@/components/JsonCodeEditor";
import JsonGraph from "@/components/JsonGraph";
import { CODEGEN_LANGUAGES, generateCode } from "@/lib/codegen";
import {
  csvToJson,
  extractCsvNotesAndData,
  jsonToCsv,
  queryJson,
  setAtPath,
} from "@/lib/convert";
import {
  CONVERT_FORMATS,
  formatToJson,
  jsonToFormat,
  type ConvertFormat,
} from "@/lib/convertFormats";
import {
  buildComparisonReport,
  diffLines,
  lineStatusMaps,
  valueDiffs,
  type LineStatus,
} from "@/lib/diff";
import {
  clearHistory,
  deleteVersion,
  listVersions,
  saveVersion,
  type Version,
} from "@/lib/history";
import { repairJson } from "@/lib/jsonRepair";
import {
  inferJsonSchema,
  validateAgainstSchema,
  type SchemaIssue,
} from "@/lib/schema";
import { copyText, downloadFile } from "@/lib/share";
import {
  buildSnapshotLink,
  classifyShareLink,
  embedNotesInJson,
  extractAnnotatedJsonNotes,
  parseSnapshotFile,
  readSnapshotFromHash,
  serializeSnapshotFile,
  snapshotFileName,
  type Snapshot,
} from "@/lib/snapshot";
import {
  arrayObjectFields,
  sortJsonValue,
  type SortDirection,
} from "@/lib/sort";
import { getJsonErrorLine } from "@/lib/utils";
import { useTheme } from "next-themes";
import { toast } from "sonner";

type JsonTreeProps = {
  label: string;
  value: unknown;
  depth?: number;
  path?: (string | number)[];
  onEdit?: (path: (string | number)[], newValue: unknown) => void;
  openDepth?: number;
};

function JsonTree({
  label,
  value,
  depth = 0,
  path = [],
  onEdit,
  openDepth = 2,
}: JsonTreeProps) {
  const [open, setOpen] = useState(depth < openDepth);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isBranch = value !== null && typeof value === "object";
  const entries = isBranch
    ? Object.entries(value as Record<string, unknown>)
    : [];
  const preview = Array.isArray(value)
    ? `[${value.length}]`
    : `{${entries.length}}`;

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
      <div
        className="group flex items-center gap-2 py-1.5 font-mono text-xs"
        style={{ paddingLeft: depth * 20 }}
      >
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {label}
        </span>
        <span className="text-slate-400 dark:text-slate-500">:</span>
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
            className="min-w-[120px] rounded border border-[var(--brand-border)] bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 outline-none dark:bg-[var(--surface-soft)] dark:text-white"
          />
        ) : (
          <>
            {typeof value === "string" && /^https?:\/\/\S+$/i.test(value) ? (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400"
                title="Open link in a new tab"
              >
                "{value}"
              </a>
            ) : (
              <button
                onClick={() => {
                  if (onEdit) {
                    setDraft(JSON.stringify(value));
                    setEditing(true);
                  }
                }}
                className={`rounded px-0.5 text-left ${typeof value === "string" ? "text-amber-600 dark:text-amber-400" : typeof value === "boolean" ? "text-violet-600 dark:text-violet-300" : "text-sky-600 dark:text-sky-400"} ${onEdit ? "cursor-text hover:bg-[var(--brand-soft)] hover:outline hover:outline-1 hover:outline-[var(--brand-border)]" : ""}`}
                title={onEdit ? "Click to edit value" : undefined}
              >
                {JSON.stringify(value)}
              </button>
            )}

            {onEdit && (
              <button
                onClick={() => {
                  setDraft(JSON.stringify(value));
                  setEditing(true);
                }}
                className="hidden text-slate-400 hover:text-[var(--brand)] dark:text-slate-500 group-hover:block"
                aria-label="Edit value"
              >
                <Pencil size={11} />
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 py-1.5 text-left font-mono text-xs font-semibold text-slate-700 hover:text-[var(--brand)] dark:text-slate-200"
        style={{ paddingLeft: depth * 20 }}
      >
        <ChevronDown
          size={13}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span>{label}</span>
        <span className="font-normal text-slate-400 dark:text-slate-500">
          {preview}
        </span>
      </button>
      {open && (
        <div>
          {entries.map(([key, child]) => (
            <JsonTree
              key={`${label}-${key}`}
              label={Array.isArray(value) ? `[${key}]` : key}
              value={child}
              depth={depth + 1}
              path={[...path, Array.isArray(value) ? Number(key) : key]}
              onEdit={onEdit}
              openDepth={openDepth}
            />
          ))}
        </div>
      )}
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
function DiffPane({
  value,
  onChange,
  statuses,
  editorRef,
  ariaLabel,
  errorLine,
  errorMessage,
}: DiffPaneProps) {
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
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
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
                    <AlertCircle size={11} />{" "}
                    {errorMessage || "Syntax error on this line"}
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
  return text.length > 1200
    ? `${text.slice(0, 1200)}\n… (${(text.length - 1200).toLocaleString()} more characters — use Copy result for the full value)`
    : text;
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
function ComparePane({
  value,
  onChange,
  statuses,
  editorRef,
  ariaLabel,
}: ComparePaneProps) {
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
          <button
            key={item}
            onClick={() => setMode(item)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold capitalize transition ${mode === item ? "bg-[var(--brand)] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-[var(--brand)]"}`}
          >
            {item === "editor" ? "Text" : item}
          </button>
        ))}
        <span className="ml-auto pr-2 text-[10px] font-semibold text-slate-400">
          {statuses.size > 0 ? `${statuses.size} lines differ` : "in sync"}
        </span>
      </div>
      {mode === "editor" && (
        <DiffPane
          value={value}
          onChange={onChange}
          statuses={statuses}
          editorRef={editorRef}
          ariaLabel={ariaLabel}
          errorLine={errorInfo.line}
          errorMessage={errorInfo.message}
        />
      )}
      {mode === "tree" && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {parsed.error ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
              Fix the JSON syntax (or hit Format) to view the tree.
            </div>
          ) : (
            <JsonTree
              label="root"
              value={parsed.value}
              onEdit={handleTreeEdit}
            />
          )}
        </div>
      )}
      {mode === "query" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--edge)] p-2.5">
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="e.g. items[?price>100].name — dot paths, [index], [*], filters"
              spellCheck={false}
              className="w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-[var(--brand-border)]"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-[var(--surface-soft)] p-2.5">
            {parsed.error && (
              <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
                Fix the JSON syntax to query this document.
              </div>
            )}
            {!parsed.error &&
              matches.slice(0, limit).map((match) => (
                <div
                  key={match.path}
                  className="rounded-lg border border-[var(--edge-soft)] bg-white p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="break-all font-mono text-[10px] font-bold text-[var(--brand)]">
                      {match.path}
                    </p>
                    <button
                      onClick={async () => {
                        if (
                          await copyText(JSON.stringify(match.value, null, 2))
                        )
                          toast.success("Copied");
                      }}
                      className="shrink-0 rounded p-1 text-slate-300 transition hover:text-[var(--brand)]"
                      aria-label="Copy this value"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  {typeof match.value === "string" &&
                  /^https?:\/\/\S+$/i.test(match.value) ? (
                    <a
                      href={match.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all font-mono text-[11px] leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                    >
                      {match.value}
                    </a>
                  ) : (
                    <pre className="mt-1 max-h-48 overflow-auto font-mono text-[11px] leading-5 text-slate-600">
                      {previewValue(match.value)}
                    </pre>
                  )}
                </div>
              ))}
            {!parsed.error && matches.length > limit && (
              <button
                onClick={() => setLimit((current) => current + 100)}
                className="w-full rounded-lg border border-dashed border-[var(--brand-border)] py-2 text-xs font-bold text-[var(--brand)] transition hover:bg-[var(--brand-soft-hover)]"
              >
                Show 100 more ({(matches.length - limit).toLocaleString()} left)
              </button>
            )}
            {!parsed.error && matches.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">
                {queryText.trim()
                  ? "No matches."
                  : "Type a query to filter this document."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type TableCandidate = {
  key: string;
  path: (string | number)[];
  rows: Record<string, unknown>[];
};

/** Find array-of-objects candidates in a parsed document: the root itself, or any top-level field. */
function findTableCandidates(root: unknown): TableCandidate[] {
  const isRowArray = (value: unknown): value is Record<string, unknown>[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );

  const candidates: TableCandidate[] = [];
  if (isRowArray(root)) candidates.push({ key: "root", path: [], rows: root });
  if (root !== null && typeof root === "object" && !Array.isArray(root)) {
    for (const [key, value] of Object.entries(
      root as Record<string, unknown>,
    )) {
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
  const [sort, setSort] = useState<{
    field: string;
    direction: SortDirection;
  } | null>(null);

  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(json) as unknown, error: false };
    } catch {
      return { value: null, error: true };
    }
  }, [json]);

  const candidates = useMemo(
    () => (parsed.error ? [] : findTableCandidates(parsed.value)),
    [parsed],
  );
  const candidate =
    candidates.find((c) => c.key === selectedKey) ?? candidates[0];
  const columns = useMemo(
    () => (candidate ? arrayObjectFields(candidate.rows) : []),
    [candidate],
  );

  const commitRows = (nextRows: unknown) => {
    if (!candidate) return;
    onChange(
      JSON.stringify(
        setAtPath(parsed.value, candidate.path, nextRows),
        null,
        2,
      ),
    );
  };

  const toggleSort = (field: string) => {
    if (!candidate) return;
    const direction: SortDirection =
      sort?.field === field && sort.direction === "asc" ? "desc" : "asc";
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
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
          Fix the JSON syntax (or hit Format) to view it as a table.
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-5 text-center text-sm text-slate-500">
          <TableIcon size={22} className="mx-auto mb-2 text-[var(--brand)]" />
          Table view works with an array of objects. This document doesn't have
          one at the root or in a top-level field — try Tree or Query instead.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-400">
          <TableIcon size={15} className="text-[var(--brand)]" />{" "}
          {candidate.rows.length} row{candidate.rows.length === 1 ? "" : "s"}{" "}
          <span className="hidden sm:inline">
            • click a column header to sort, click a cell to edit • scroll right
            for more columns
          </span>
        </div>
        {candidates.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="eyebrow">Array:</span>
            {candidates.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedKey(c.key)}
                title={`View "${c.key}" as a table`}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold transition ${candidate.key === c.key ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)] dark:bg-[var(--surface)] dark:text-slate-300 dark:shadow-none"}`}
              >
                <TableIcon size={12} />
                {c.key}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <table
          key={candidate.key}
          className="border-collapse text-left text-xs"
        >
          <thead className="sticky top-0 z-10 bg-[var(--surface-page)]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  onClick={() => toggleSort(column)}
                  className="cursor-pointer whitespace-nowrap border-b border-r border-[var(--edge-soft)] px-3 py-2 font-mono font-bold text-slate-600 dark:text-slate-300 hover:bg-[var(--brand-soft-hover)]"
                >
                  <span className="flex items-center gap-1">
                    {column}
                    {sort?.field === column ? (
                      sort.direction === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown
                        size={11}
                        className="text-slate-400 dark:text-slate-500"
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidate.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-[var(--surface-soft)]">
                {columns.map((column) => {
                  const cellValue = row[column];
                  const isUrl =
                    typeof cellValue === "string" &&
                    /^https?:\/\/\S+$/i.test(cellValue);
                  return (
                    <td
                      key={column}
                      className="border-b border-r border-[var(--edge-soft)] px-3 py-1.5 font-mono"
                    >
                      {isUrl ? (
                        <a
                          href={cellValue as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400"
                        >
                          {cellValue as string}
                        </a>
                      ) : (
                        <input
                          defaultValue={
                            cellValue === undefined
                              ? ""
                              : JSON.stringify(cellValue)
                          }
                          onBlur={(event) => {
                            if (
                              event.target.value !== JSON.stringify(cellValue)
                            )
                              editCell(rowIndex, column, event.target.value);
                          }}
                          className={`w-full min-w-[80px] bg-transparent outline-none focus:bg-[var(--brand-soft-hover)] ${typeof cellValue === "string" ? "text-amber-700 dark:text-amber-400" : typeof cellValue === "boolean" ? "text-violet-600 dark:text-violet-300" : typeof cellValue === "number" ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"}`}
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
  {
    id: 1,
    name: "Personal Office",
    type: "Personal",
    color: "bg-[var(--brand)]",
  },
  { id: 2, name: "API Guild", type: "Team", color: "bg-[var(--violet)]" },
];

/**
 * First-run seed.
 *
 * One sample document, so a new visitor lands on something they can
 * immediately format, fold, graph and query rather than an empty box.
 *
 * Deliberately NO seeded notes. There used to be two, attributed to
 * "Chenna (Lead Dev)" and "Sarah (API Architect)" — to a stranger those
 * read as real colleagues commenting on their file, which is confusing at
 * best and looks like leaked data at worst. The notes panel now starts
 * genuinely empty and invites the first annotation instead.
 *
 * `webhook-payload.json` was also dropped: two seeded files implied saved
 * work the visitor never did.
 */
const starterDocuments: DocumentRecord[] = [];

const starterNotes: Note[] = [];

interface FaqItem {
  id: string;
  category: "general" | "repair" | "views" | "convert" | "history" | "privacy";
  categoryLabel: string;
  question: string;
  answer: string;
  tags: string[];
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what-is-jsonfield",
    category: "general",
    categoryLabel: "Getting Started",
    question:
      "What is JSONField and why is it different from basic JSON formatters?",
    answer:
      "JSONField is an intelligent, context-aware JSON editor that pairs raw JSON editing with structural annotation notes. Unlike basic web formatters, JSONField tracks full revision history, attaches persistent notes directly to JSON line numbers/AST paths, offers interactive node-graph visualization, and repairs malformed JSON automatically without data loss.",
    tags: ["getting started", "features", "notes", "editor", "overview"],
  },
  {
    id: "reference-notes",
    category: "general",
    categoryLabel: "Getting Started",
    question: "How do Reference Notes work and do they stay attached?",
    answer:
      "You can right-click any line in the JSON editor or click 'Add comment' to attach notes, todo items, or explanations directly to a JSON path (e.g. endpoints[0].auth). Notes remain attached even as you reformat, indent, or edit the document structure. You can resolve, reply to, or export review notes as Markdown.",
    tags: ["notes", "comments", "annotation", "collaboration", "export"],
  },
  {
    id: "collaboration-workspaces",
    category: "general",
    categoryLabel: "Getting Started",
    question: "How do Personal and Team workspaces work in JSONField?",
    answer:
      "JSONField supports both Personal and Team workspaces. You can switch or create workspaces from the top-left dropdown menu, organizing related JSON documents and notes together. You can also export full workspace JSON archives or generate encrypted snapshot URLs to share annotated JSON states.",
    tags: ["workspaces", "team", "organization", "projects"],
  },
  {
    id: "auto-repair",
    category: "repair",
    categoryLabel: "JSON Repair & Syntax",
    question: "How does JSONField automatically repair broken JSON?",
    answer:
      "When you paste invalid JSON (such as Python dictionaries with single quotes 'key': 'val', missing quotes around object keys, trailing commas [1, 2, 3,], unescaped newlines, or C-style // comments), JSONField's tolerant parser automatically repairs the syntax into strict RFC-8259 compliant JSON when you click Format or press Cmd/Ctrl + Shift + F.",
    tags: [
      "repair",
      "format",
      "single quotes",
      "trailing commas",
      "comments",
      "syntax",
    ],
  },
  {
    id: "data-integrity",
    category: "repair",
    categoryLabel: "JSON Repair & Syntax",
    question: "Will JSON Repair modify my actual data values?",
    answer:
      "No. The repair engine strictly fixes structural syntax defects (quotes, missing commas, comment removal, trailing delimiters, NaN/Infinity representations). Your numerical values, string content, booleans, and nulls are preserved with 100% precision.",
    tags: ["data integrity", "safety", "repair", "precision"],
  },
  {
    id: "syntax-diagnostics",
    category: "repair",
    categoryLabel: "JSON Repair & Syntax",
    question: "How does line error diagnostic highlighting work?",
    answer:
      "JSONField displays real-time diagnostics pinpointing the exact line number, column offset, and unexpected token causing the syntax error, highlighting the error location directly inside the CodeMirror editor.",
    tags: ["diagnostics", "errors", "syntax error", "linting"],
  },
  {
    id: "interactive-views",
    category: "views",
    categoryLabel: "Views & Querying",
    question: "What are the 5 interactive views available in JSONField?",
    answer:
      "JSONField features 5 specialized views: Editor View (CodeMirror 6 editor with line notes), Tree View (interactive expandable AST node tree with level depth selectors), Query View (expressive path filter evaluator), Table View (spreadsheet grid representation of array elements with column sorting), and Graph View (interactive node-link graph diagram with SVG/PNG export).",
    tags: [
      "views",
      "tree view",
      "table view",
      "graph view",
      "query view",
      "editor",
    ],
  },
  {
    id: "query-path",
    category: "views",
    categoryLabel: "Views & Querying",
    question: "How do I filter JSON using JSONPath selectors in Query View?",
    answer:
      "In Query View, you can type selectors like endpoints[*].name, items[?auth=true].path, or settings.*. JSONField evaluates the path in real-time, displays all matching sub-trees, and provides 1-click copy controls for filtered results.",
    tags: ["query", "jsonpath", "filtering", "search", "paths"],
  },
  {
    id: "graph-export",
    category: "views",
    categoryLabel: "Views & Querying",
    question: "Can I export the interactive Graph diagram?",
    answer:
      "Yes! In Graph View, click the SVG or PNG export buttons in the top right control bar to download crisp high-resolution vector diagrams of your JSON structure for documentation, architecture diagrams, or slides.",
    tags: ["graph", "svg", "png", "export", "diagram"],
  },
  {
    id: "supported-conversions",
    category: "convert",
    categoryLabel: "Conversion & Codegen",
    question: "Which file formats can I convert JSON to?",
    answer:
      "You can convert JSON bi-directionally to and from YAML, CSV (for array data), XML, TOML, and Python Dictionary literals. Click 'Convert Format' in the header to switch formats with 1-click format auto-detection.",
    tags: ["convert", "yaml", "csv", "xml", "toml", "python"],
  },
  {
    id: "code-models",
    category: "convert",
    categoryLabel: "Conversion & Codegen",
    question:
      "How do I generate TypeScript, Go, Python, or Rust models from JSON?",
    answer:
      "Click 'Generate Code' in the header tool menu. JSONField instantly infers the schema from your active JSON payload and generates strongly-typed model definitions for TypeScript (interfaces/types), Go (structs with json tags), Python (Pydantic models / TypedDict), Rust (Serde structs), Java (POJOs), or C# (Classes).",
    tags: [
      "codegen",
      "typescript",
      "golang",
      "python",
      "rust",
      "java",
      "csharp",
    ],
  },
  {
    id: "revision-history",
    category: "history",
    categoryLabel: "History & Snapshots",
    question: "How does local on-device version history work?",
    answer:
      "JSONField automatically records a revision snapshot whenever you format, repair, or make significant edits to your document. Click 'History' in the subheader to view past timestamps, diff changes, restore previous versions, or label revision milestones.",
    tags: ["history", "revisions", "version control", "diff", "undo"],
  },
  {
    id: "shareable-snapshots",
    category: "history",
    categoryLabel: "History & Snapshots",
    question: "How does 100% private URL hash snapshot sharing work?",
    answer:
      "Yes! When you click 'Share Snapshot', JSONField compresses your JSON payload into a URL hash fragment (#snapshot=...) using DEFLATE compression. Because the data is stored in the URL hash, server-side HTTP logs never receive or store your confidential JSON payload.",
    tags: ["snapshots", "sharing", "privacy", "url", "compression"],
  },
  {
    id: "data-privacy",
    category: "privacy",
    categoryLabel: "Privacy & Security",
    question: "Is my JSON data kept private and secure?",
    answer:
      "Yes, 100%. All JSON formatting, linting, graph rendering, code generation, and share snapshot compression run entirely client-side inside your browser. No JSON payloads are ever sent to any remote server.",
    tags: ["privacy", "security", "local", "browser", "data safety"],
  },
  {
    id: "large-files",
    category: "privacy",
    categoryLabel: "Privacy & Security",
    question: "What is the maximum JSON file size JSONField can handle?",
    answer:
      "JSONField is built with virtualized line rendering and efficient AST memory management. It comfortably handles large JSON files up to 50MB+ in size without crashing or freezing the browser UI.",
    tags: ["large files", "performance", "memory", "50MB"],
  },
  {
    id: "offline-support",
    category: "privacy",
    categoryLabel: "Privacy & Security",
    question: "Does JSONField work offline without an internet connection?",
    answer:
      "Yes! JSONField is a fully self-contained Single Page Application (SPA). Once loaded, it works 100% offline without requiring an active internet connection.",
    tags: ["offline", "pwa", "no internet", "browser"],
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
  const [noteFilter, setNoteFilter] = useState<"all" | "open" | "resolved">(
    "all",
  );
  const [replyingNoteId, setReplyingNoteId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMention, setReplyMention] = useState("");
  const [copied, setCopied] = useState(false);
  const [formatMessage, setFormatMessage] = useState("");
  const [commentLine, setCommentLine] = useState(1);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    line: number;
  } | null>(null);
  const [view, setView] = useState<
    "editor" | "tree" | "query" | "table" | "graph"
  >("editor");
  const [sharedBanner, setSharedBanner] = useState<{
    hasCompare: boolean;
    noteCount: number;
  } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [queryText, setQueryText] = useState("endpoints[*].name");
  const [queryLimit, setQueryLimit] = useState(50);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState<string>("all");
  // Was "what-is-json-desk", which matched no entry in FAQ_ITEMS — left behind
  // by an earlier rename, so the FAQ opened with nothing expanded instead of
  // with the lead answer open. Kept in sync with the first item's id.
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(
    "what-is-jsonfield",
  );
  const [tourOpen, setTourOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [floatingWidgetOpen, setFloatingWidgetOpen] = useState(false);
  /**
   * Window-wide file drop.
   *
   * Dragging a session file onto the page is the first thing most people
   * try, and it previously did nothing — the browser just navigated away
   * from the app to render the raw JSON, which looks like a crash and
   * loses whatever was in the editor.
   *
   * Two things matter here. Only react when the drag actually carries
   * FILES: CodeMirror supports dragging text within the editor, and
   * hijacking those drags would break selection-dragging. And track enter
   * and leave with a counter, because dragleave fires every time the
   * pointer crosses a child element, so a naive boolean flickers.
   */
  const [dragDepth, setDragDepth] = useState(0);
  const dragActive = dragDepth > 0;

  const dragHasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setDragDepth((d) => d + 1);
  };

  const onDragOver = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    // Without preventDefault on dragover the drop event never fires.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    setDragDepth((d) => Math.max(0, d - 1));
  };

  const onDrop = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setDragDepth(0);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (event.dataTransfer.files.length > 1) {
      toast.info(`Opening ${file.name}`, {
        description: "One file at a time — the rest were ignored.",
      });
    }
    importFile(file);
  };

  const pipWindowRef = useRef<Window | null>(null);
  const [helpTab, setHelpTab] = useState<"query" | "contact" | "faq">("query");
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportCategory, setSupportCategory] = useState("General Query");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  /*
   * Defaults to off.
   *
   * Ticking this puts up to 1200 characters of the user's document into a
   * mail.google.com query string, so it is recorded in Google's request logs and
   * in the user's own browser history — not just in a draft they can review
   * before sending. This is the only place in the whole app where document
   * content leaves the browser, and the app's headline promise is that it never
   * does. A promise like that cannot ship pre-ticked.
   */
  const [supportIncludeJson, setSupportIncludeJson] = useState(false);
  const [querySubmitted, setQuerySubmitted] = useState(false);
  const [queryRefId, setQueryRefId] = useState("");
  // Callback-request state removed with the phone/WhatsApp contact options:
  // the owner's number should not be published, so there is no call path.

  const filteredFaqs = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory =
        faqCategory === "all" || item.category === faqCategory;
      const searchLower = faqSearch.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        item.question.toLowerCase().includes(searchLower) ||
        item.answer.toLowerCase().includes(searchLower) ||
        item.tags.some((tag) => tag.toLowerCase().includes(searchLower));
      return matchesCategory && matchesSearch;
    });
  }, [faqCategory, faqSearch]);

  // Sync main JSON state into open Document Picture-in-Picture window
  useEffect(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      const textarea = pipWindowRef.current.document.getElementById(
        "pip-text",
      ) as HTMLTextAreaElement;
      if (textarea && textarea.value !== json) {
        textarea.value = json;
        const linesSpan =
          pipWindowRef.current.document.getElementById("pip-lines");
        if (linesSpan) linesSpan.innerText = `${json.split("\n").length} lines`;
      }
    }
  }, [json]);

  // Automatic Spotify / Google Meet style Overlay detection:
  // When developer switches away to another tab or application (VS Code, Terminal, Postman),
  // automatically show the floating mini-editor overlay! When returning to JSONField tab, auto-dock/close it.
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

    if (
      typeof window !== "undefined" &&
      (
        window as unknown as {
          documentPictureInPicture?: {
            requestWindow: (opts?: {
              width?: number;
              height?: number;
            }) => Promise<Window>;
          };
        }
      ).documentPictureInPicture?.requestWindow
    ) {
      try {
        const pipWin = await (
          window as unknown as {
            documentPictureInPicture: {
              requestWindow: (opts?: {
                width?: number;
                height?: number;
              }) => Promise<Window>;
            };
          }
        ).documentPictureInPicture.requestWindow({
          width: 480,
          height: 540,
        });

        pipWin.document.title = "JSONField — Floating Mini-Editor";
        pipWin.document.body.style.margin = "0";
        pipWin.document.body.style.padding = "10px";
        pipWin.document.body.style.background = "#0f172a";
        pipWin.document.body.style.color = "#f8fafc";
        pipWin.document.body.style.boxSizing = "border-box";

        pipWin.document.body.innerHTML = `
          <div style="display:flex; flex-direction:column; height:calc(100vh - 20px); gap:8px; font-family:system-ui,-apple-system,sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:6px; border-bottom:1px solid #334155;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:bold; font-size:13px; color:#38bdf8;">📌 JSONField Mini</span>
                <span id="pip-status" style="font-size:10px; padding:2px 6px; border-radius:99px; background:#065f46; color:#34d399; font-weight:bold;">Valid</span>
              </div>
              <div style="display:flex; gap:6px;">
                <button id="pip-format" style="background:#0284c7; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">⚡ Format</button>
                <button id="pip-copy" style="background:#334155; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">📋 Copy</button>
              </div>
            </div>
            <textarea id="pip-text" style="flex:1; width:100%; background:#020617; color:#f8fafc; border:1px solid #334155; border-radius:8px; padding:10px; font-family:monospace; font-size:12px; resize:none; outline:none; box-sizing:border-box; line-height:1.5;"></textarea>
            <div style="font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
              <span>⚡ Live two-way sync with main JSONField</span>
              <span id="pip-lines">0 lines</span>
            </div>
          </div>
        `;

        const textarea = pipWin.document.getElementById(
          "pip-text",
        ) as HTMLTextAreaElement;
        const formatBtn = pipWin.document.getElementById("pip-format");
        const copyBtn = pipWin.document.getElementById("pip-copy");
        const statusBadge = pipWin.document.getElementById("pip-status");
        const linesSpan = pipWin.document.getElementById("pip-lines");

        if (textarea) {
          textarea.value = json;
          if (linesSpan)
            linesSpan.innerText = `${json.split("\n").length} lines`;

          textarea.oninput = (e) => {
            const val = (e.target as HTMLTextAreaElement).value;
            setJson(val);
            if (linesSpan)
              linesSpan.innerText = `${val.split("\n").length} lines`;
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
              if (linesSpan)
                linesSpan.innerText = `${formatted.split("\n").length} lines`;
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
        console.warn(
          "Document Picture-in-Picture window launch failed, enabling floating widget",
          err,
        );
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

    const mailSubject = encodeURIComponent(
      `[JSONField Query #${refId}] ${supportSubject || supportCategory}`,
    );
    const mailBodyText = `Name: ${supportName}
Email: ${supportEmail}
Category: ${supportCategory}
Ref ID: #${refId}

Query Details:
${supportMessage}

${snippet ? `\n--- Attached JSON Snippet (first 1200 chars, not sanitized — review before sending) ---\n${snippet}` : ""}`;

    const encodedBody = encodeURIComponent(mailBodyText);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=${mailSubject}&body=${encodedBody}`;

    setQueryRefId(refId);
    setQuerySubmitted(true);

    // Open Gmail Web Compose directly in Chrome/browser (bypasses macOS Mail app!)
    window.open(gmailUrl, "_blank");
    toast.success(`Query #${refId} registered! Opening Gmail Web Compose...`);
  };

  const resetSupportForms = () => {
    setQuerySubmitted(false);
    setSupportSubject("");
    setSupportMessage("");
  };
  const [sortOpen, setSortOpen] = useState(false);
  const [sortTargetKey, setSortTargetKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState("");
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaText, setSchemaText] = useState(
    '{\n  "type": "object",\n  "required": [],\n  "properties": {}\n}',
  );
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
  const dragState = useRef<{
    side: "left" | "right";
    startX: number;
    startWidth: number;
    otherWidth: number;
  } | null>(null);
  const MIN_CENTER_WIDTH = 420;
  const LEFT_MIN = 248;
  const LEFT_MAX = 320;
  const RIGHT_MIN = 300;
  const RIGHT_MAX = 400;

  const startDrag =
    (side: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.current = {
        side,
        startX: event.clientX,
        startWidth: side === "left" ? leftWidth : rightWidth,
        otherWidth:
          side === "left"
            ? rightCollapsed
              ? 0
              : rightWidth
            : leftCollapsed
              ? 0
              : leftWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    if (drag.side === "left") {
      const maxForCenter = Math.max(
        LEFT_MIN,
        window.innerWidth - drag.otherWidth - MIN_CENTER_WIDTH,
      );
      setLeftWidth(
        Math.min(
          LEFT_MAX,
          maxForCenter,
          Math.max(LEFT_MIN, drag.startWidth + delta),
        ),
      );
    } else {
      const maxForCenter = Math.max(
        RIGHT_MIN,
        window.innerWidth - drag.otherWidth - MIN_CENTER_WIDTH,
      );
      setRightWidth(
        Math.min(
          RIGHT_MAX,
          maxForCenter,
          Math.max(RIGHT_MIN, drag.startWidth - delta),
        ),
      );
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
      setLeftWidth((current) =>
        Math.min(
          LEFT_MAX,
          Math.max(LEFT_MIN, current),
          Math.max(LEFT_MIN, window.innerWidth - otherRight - MIN_CENTER_WIDTH),
        ),
      );
      setRightWidth((current) =>
        Math.min(
          RIGHT_MAX,
          Math.max(RIGHT_MIN, current),
          Math.max(RIGHT_MIN, window.innerWidth - otherLeft - MIN_CENTER_WIDTH),
        ),
      );
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftCollapsed, rightCollapsed]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cmRef = useRef<JsonCodeEditorHandle>(null);
  const [documentName, setDocumentName] = useState("northstar-api.json");
  const [activeDocumentKey, setActiveDocumentKey] = useState<string | null>(
    "northstar-api.json",
  );
  /** Name of the document whose delete button is armed, or null. */
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"current" | "documents">(
    "current",
  );
  const [workspaceDocuments, setWorkspaceDocuments] = useState<
    Record<number, DocumentRecord[]>
  >({ 1: starterDocuments, 2: [] });
  const [workspaces, setWorkspaces] = useState<Workspace[]>(starterWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(1);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [workspaceDraftType, setWorkspaceDraftType] =
    useState<Workspace["type"]>("Personal");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareJson, setCompareJson] = useState(
    initialJson.replace('"rateLimit": 100', '"rateLimit": 120'),
  );
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const compareCurrentRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);

  const workspace =
    workspaces.find((item) => item.id === workspaceId) || workspaces[0];
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

  const diffRows = useMemo(
    () => diffLines(normalizedJsons.left, normalizedJsons.right),
    [normalizedJsons],
  );
  const changedRows = useMemo(
    () => diffRows.filter((row) => row.status !== "same"),
    [diffRows],
  );
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
    const next = {
      id: Date.now(),
      name,
      type: workspaceDraftType,
      color:
        workspaceDraftType === "Team"
          ? "bg-[var(--violet)]"
          : "bg-[var(--terracotta)]",
    };
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
      const existing = activeDocumentKey
        ? currentDocuments.findIndex(
            (document) => document.name === activeDocumentKey,
          )
        : -1;
      const nextDocuments =
        existing < 0
          ? [record, ...currentDocuments]
          : currentDocuments.map((document, index) =>
              index === existing ? record : document,
            );
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
      setNotes(documentNotes[targetKey] || []);
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
    setFormatMessage(
      nextWorkspace
        ? `Switched to ${nextWorkspace.name}`
        : "Workspace switched",
    );
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

  /**
   * Delete a document and, if it was the one on screen, actually leave it.
   *
   * This previously only filtered the document out of the list and nulled
   * `activeDocumentKey` — it never touched the editor. So deleting the open
   * document left its name in the breadcrumb and its content in the buffer,
   * and pressing Save would resurrect it. It also orphaned the document's
   * notes in `documentNotes`, so creating a new file with the same name
   * inherited the dead file's annotations.
   */
  const deleteDocumentRecord = (docName: string) => {
    const remaining = (workspaceDocuments[workspaceId] || []).filter(
      (item) => item.name !== docName,
    );

    setWorkspaceDocuments((prev) => ({ ...prev, [workspaceId]: remaining }));

    // Drop the deleted document's notes so the name can be reused clean.
    setDocumentNotes((all) => {
      const next = { ...all };
      delete next[`${workspaceId}:${docName}`];
      return next;
    });

    // Only disturb the editor if we just deleted what it was showing.
    if (documentName === docName) {
      if (remaining.length > 0) {
        // Fall through to the next surviving document.
        const next = remaining[0];
        setActiveDocumentKey(next.name);
        setDocumentName(next.name);
        setJson(next.content);
        setNotes(documentNotes[`${workspaceId}:${next.name}`] || []);
      } else {
        // Nothing left — hand back a clean untitled buffer.
        setActiveDocumentKey(null);
        setDocumentName("untitled.json");
        setJson("{\n  \n}");
        setNotes([]);
      }
      setStatus("valid");
      setFormatMessage("");
      setView("editor");
      setCompareOpen(false);
    } else if (activeDocumentKey === docName) {
      setActiveDocumentKey(null);
    }

    toast.success(`Deleted ${docName}`);
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
    setNotes(documentNotes[targetKey] || []);
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
      return findTableCandidates(JSON.parse(json)).map((c) => ({
        key: c.key,
        path: c.path,
        fields: arrayObjectFields(c.rows),
      }));
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
        const target =
          sortCandidates.find((c) => c.key === sortTargetKey) ??
          sortCandidates[0];
        if (!target) return;
        const currentRows = target.path.reduce(
          (node: unknown, key) =>
            (node as Record<string, unknown>)[key as string],
          root as unknown,
        );
        const sorted = sortJsonValue(
          currentRows,
          direction,
          sortField || undefined,
        );
        setJson(JSON.stringify(setAtPath(root, target.path, sorted), null, 2));
      }
      setStatus("valid");
      toast.success(
        `Sorted ${direction === "asc" ? "ascending" : "descending"}`,
      );
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
      setSchemaError(
        error instanceof Error ? error.message : "Could not run validation",
      );
    }
  };

  const generateSchemaFromDoc = () => {
    try {
      const parsed = JSON.parse(json);
      const inferred = inferJsonSchema(parsed);
      setSchemaText(JSON.stringify(inferred, null, 2));
      toast.success("Generated schema from active document");
    } catch {
      toast.error(
        "Document is not valid JSON — fix syntax before generating schema.",
      );
    }
  };

  const loadTestSchema = () => {
    try {
      const parsed = JSON.parse(json);
      const inferred = inferJsonSchema(parsed) as Record<string, unknown>;
      const required = Array.isArray(inferred.required)
        ? [...inferred.required, "apiKey"]
        : ["apiKey"];
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
          2,
        ),
      );
      toast.info("Loaded sample test schema requiring 'apiKey' field");
    }
  };

  const runCodegen = async () => {
    setCodegenLoading(true);
    setCodegenError("");
    const language =
      CODEGEN_LANGUAGES[codegenLangIndex] ?? CODEGEN_LANGUAGES[0];
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
    if (await copyText(codegenOutput))
      toast.success("Code copied to clipboard");
    else toast.error("Could not copy — check browser clipboard permissions");
  };

  const downloadCode = () => {
    const language =
      CODEGEN_LANGUAGES[codegenLangIndex] ?? CODEGEN_LANGUAGES[0];
    const base = documentName.replace(/\.json$/i, "") || "model";
    downloadFile(`${base}.${language.ext}`, codegenOutput, "text/plain");
    toast.success(`Downloaded ${base}.${language.ext}`);
  };

  const runConvert = () => {
    setConvertError("");
    if (convertDirection === "to") {
      const result = jsonToFormat(json, convertFormatId);
      if (result.ok) setConvertOutput(result.value);
      else {
        setConvertOutput("");
        setConvertError(result.error);
      }
    } else {
      const result = formatToJson(convertInput, convertFormatId);
      if (result.ok) setConvertOutput(result.value);
      else {
        setConvertOutput("");
        setConvertError(result.error);
      }
    }
  };

  const convertFormatInfo = () =>
    CONVERT_FORMATS.find((f) => f.id === convertFormatId) ?? CONVERT_FORMATS[0];

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
    toast.success("Restored version", {
      description: `From ${new Date(version.savedAt).toLocaleString()}`,
    });
  };

  const compareVersion = (version: Version) => {
    setCompareJson(version.content);
    setCompareOpen(true);
    setView("editor");
    setHistoryOpen(false);
    toast.success("Comparing against this version", {
      description: "Differences are highlighted in the compare view.",
    });
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
      return {
        matches: [],
        error:
          "The document is not valid JSON — fix it in the editor (or hit Format) to query it.",
      };
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
      toast.error("Could not convert to CSV", {
        description:
          error instanceof Error
            ? error.message
            : "JSON must be an object or array of objects.",
      });
    }
  };

  const importFile = (file: File) => {
    /*
     * Refuse oversized files before reading them.
     *
     * Everything downstream is synchronous and on the main thread — FileReader,
     * then repairJson's five parse attempts, then CodeMirror rendering the
     * result — so there is no point at which a too-large document degrades
     * gracefully; it just hangs the tab. Drops are accepted window-wide, so a
     * mis-dragged multi-gigabyte file does it by accident. A clear refusal beats
     * a freeze.
     */
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error(`${file.name} is too large to open`, {
        description: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMPORT_BYTES)} — past that the editor cannot stay responsive.`,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        // A .jsonfield snapshot file restores full shared session (doc, compare, notes, view)
        const snapshot = parseSnapshotFile(text);
        if (snapshot) {
          restoreSnapshot(snapshot, "file");
          return;
        }

        if (/\.csv$/i.test(file.name)) {
          const { dataText, notes: extractedNotes } =
            extractCsvNotesAndData(text);
          setJson(JSON.stringify(csvToJson(dataText), null, 2));
          const targetName = file.name.replace(/\.csv$/i, ".json");
          setDocumentName(targetName);
          const key = `${workspaceId}:${targetName}`;

          if (extractedNotes && extractedNotes.length > 0) {
            setNotes(extractedNotes);
            setDocumentNotes((all) => ({ ...all, [key]: extractedNotes }));
            toast.success(
              `Imported ${file.name} — restored ${extractedNotes.length} reference note(s) & replies`,
            );
          } else {
            setNotes([]);
            setDocumentNotes((all) => ({ ...all, [key]: [] }));
            toast.success(`Converted ${file.name} to JSON`);
          }
        } else {
          // Check for embedded comments ($comments or _comments) inside exported JSON
          const { cleanJson, notes: extractedNotes } =
            extractAnnotatedJsonNotes(text);
          const result = repairJson(cleanJson);
          if (result.error) throw new Error(result.error);

          setJson(result.value);
          const targetName = file.name.endsWith(".json")
            ? file.name
            : `${file.name}.json`;
          const key = `${workspaceId}:${targetName}`;

          if (extractedNotes && extractedNotes.length > 0) {
            setNotes(extractedNotes);
            setDocumentNotes((all) => ({ ...all, [key]: extractedNotes }));
            toast.success(
              `Imported ${file.name} — restored ${extractedNotes.length} reference note(s) & replies`,
            );
          } else {
            setNotes([]);
            setDocumentNotes((all) => ({ ...all, [key]: [] }));
            toast.success(
              result.repaired
                ? `Imported and repaired ${file.name}`
                : `Imported ${file.name}`,
            );
          }
          setDocumentName(targetName);
        }
        setActiveDocumentKey(null);
        setStatus("valid");
        setActiveSection("current");
        setView("editor");
      } catch (error) {
        toast.error(`Could not import ${file.name}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setFullscreen(false);
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
      toast.success(
        `Downloaded ${filename} with ${notes.length} reference note(s) & replies`,
      );
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
    const segment =
      pathSegments[pathSegments.length - 1]?.replace("]", "") || note.path;
    const fallbackLineIndex = lines.findIndex((line) =>
      line.toLowerCase().includes(segment.toLowerCase()),
    );
    const targetLineIndex = lines[note.line - 1]
      ?.toLowerCase()
      .includes(segment.toLowerCase())
      ? lineIndex
      : fallbackLineIndex;
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
    const closeMenus = () => {
      setContextMenu(null);
      setMoreOpen(false);
      setHeaderMenuOpen(false);
      setThemeMenuOpen(false);
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  const addNote = () => {
    if (!noteText.trim()) return;
    const lineText = json.split("\n")[commentLine - 1] || "";
    const key = lineText.match(/"([^"\\]+)"\s*:/)?.[1] || `line ${commentLine}`;
    const note = {
      id: editingNoteId || Date.now(),
      title: noteTitle.trim() || "Untitled note",
      text: noteText.trim(),
      path: key,
      line: commentLine,
      mention: noteMention.trim(),
      color: "bg-cyan-400",
    };
    setNotes((current) => {
      const next = editingNoteId
        ? current.map((item) =>
            item.id === editingNoteId
              ? { ...item, ...note, color: item.color }
              : item,
          )
        : [...current, note];
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
      const next = current.map((item) =>
        item.id === note.id ? { ...item, resolved: !item.resolved } : item,
      );
      const docKey = `${workspaceId}:${documentName}`;
      setDocumentNotes((all) => ({ ...all, [docKey]: next }));
      return next;
    });
    toast.success(note.resolved ? "Reopened comment" : "Marked resolved");
  };

  const addReply = (noteId: number) => {
    if (!replyText.trim()) return;
    const reply: Reply = {
      id: Date.now(),
      text: replyText.trim(),
      mention: replyMention.trim(),
      at: Date.now(),
    };
    setNotes((current) => {
      const next = current.map((item) =>
        item.id === noteId
          ? { ...item, replies: [...(item.replies ?? []), reply] }
          : item,
      );
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
      lines.push(
        `## ${note.resolved ? "✓ " : ""}${note.title}  \`${note.path}\` (line ${note.line})`,
      );
      if (note.mention) lines.push(`_@${note.mention}_`);
      lines.push("", note.text, "");
      for (const reply of note.replies ?? []) {
        lines.push(
          `> ${reply.mention ? `**@${reply.mention}:** ` : ""}${reply.text}`,
        );
      }
      if (note.replies?.length) lines.push("");
    }
    downloadFile(
      documentName.replace(/\.json$/i, "") + "-review.md",
      lines.join("\n"),
      "text/markdown",
    );
    toast.success("Review exported", {
      description: "Markdown with every comment, mention, and reply.",
    });
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
    const fit = classifyShareLink(link.length);
    const chars = link.length.toLocaleString();

    // Past SHARE_LINK_MAX the link is a liability, so hand over the snapshot
    // file instead. The old threshold here was 60,000 characters, chosen
    // against the browser URL cap — but the browser was never the binding
    // constraint (a hash fragment is never sent anywhere). What actually
    // breaks is the paste target: chat message caps and mail clients that
    // line-wrap and split the URL. So this now trips far earlier.
    if (fit === "too-long") {
      shareAsFile(includeCompare, true);
      toast.info(`Too large to share as a link (${chars} characters)`, {
        description:
          "Sent as a .jsonfield snapshot file instead — it carries the same session, at any size. The recipient imports it to restore everything.",
      });
      return;
    }

    // Only hand a link to the OS share sheet when it's actually safe to
    // paste. `navigator.share` exists on desktop Chrome/Safari too, so a
    // "long" link would otherwise be passed straight to the share sheet and
    // the size warning below would never be reached — the user would send a
    // link that breaks on arrival with no indication anything was wrong.
    if (fit === "safe" && navigator.share) {
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
    if (!ok) {
      toast.error(
        "Could not copy the link — check browser clipboard permissions",
      );
      return;
    }

    // A long link still works when opened, but may not survive the trip.
    // Say so plainly and offer the format that will, rather than reporting
    // "100% self-contained!" and letting it break in the recipient's inbox.
    if (fit === "long") {
      toast.warning(`${label} copied, but it's long (${chars} characters)`, {
        description:
          "Chat apps and email clients may cut or wrap it. Use a snapshot file if the recipient can't open it.",
        action: {
          label: "Use file",
          onClick: () => shareAsFile(includeCompare),
        },
      });
      return;
    }

    toast.success(`${label} copied to clipboard`, {
      description: `${chars} characters — self-contained, nothing sent to a server.`,
    });
  };

  // Export the session as a portable snapshot file. Importing it anywhere
  // restores the document, the comparison, and the notes — and lands the
  // recipient in the diff immediately.
  // `silent` when the caller already explained why we fell back to a file —
  // otherwise the too-large path stacks two toasts for one click.
  const shareAsFile = (includeCompare: boolean, silent = false) => {
    // Named after the document, not "download.jsonfield". A recipient sent
    // three sessions otherwise gets download.jsonfield, download(1).jsonfield,
    // download(2).jsonfield and cannot tell them apart.
    const fileName = snapshotFileName(documentName);
    downloadFile(
      fileName,
      serializeSnapshotFile(buildSnapshot(includeCompare)),
      "application/json",
    );
    if (!silent) {
      // Say where it goes — the recipient otherwise holds a file with no
      // idea what to do with it.
      toast.success(`Saved ${fileName}`, {
        description:
          "Send this file. The recipient drops it onto JSONField, or uses More → Import file or session.",
      });
    }
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
    toast.success(
      source === "file" ? "Imported shared session" : "Loaded shared session",
    );
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
    downloadFile(
      documentName.replace(/\.json$/i, "") + "-comparison.md",
      comparisonReport(),
      "text/markdown",
    );
    toast.success("Comparison report downloaded", {
      description:
        "Markdown file with summary, per-path table, changed lines, and both documents.",
    });
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
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    };
    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jumpToCompareLine = (leftLine: number, rightLine: number) => {
    const jump = (
      editor: HTMLTextAreaElement | null,
      content: string,
      line: number,
    ) => {
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
    .filter((note) =>
      noteFilter === "all"
        ? true
        : noteFilter === "resolved"
          ? note.resolved
          : !note.resolved,
    )
    .filter((note) =>
      `${note.title} ${note.text} ${note.path}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const openNoteCount = notes.filter((note) => !note.resolved).length;

  return (
    <main
      className="blueprint-ground relative min-h-screen text-[var(--ink)]"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop affordance. Only appears while a file is actually over the
          window, so it costs nothing at rest. */}
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-[var(--surface-page)]/80 backdrop-blur-sm">
          <div className="panel flex flex-col items-center gap-3 px-10 py-8 shadow-lg">
            <Upload size={22} className="text-[var(--brand)]" />
            <p className="text-[15px] font-bold tracking-[-0.02em]">
              Drop to open
            </p>
            <p className="eyebrow">.jsonfield.json · .json · .csv · .txt</p>
          </div>
        </div>
      )}
      <header className="flex h-[76px] items-center justify-between border-b border-[var(--rule)] bg-[var(--surface)] px-5 lg:px-8">
        {/* Brand: a square die-stamp, not a rounded app icon. The
            wordmark sets JSON in mono and Field in Manrope — the tool and
            the surface, stated in the two typefaces the UI runs on. */}
        <div className="flex items-center gap-3.5">
          {/* The violet underbar that used to sit here read as a
              rendering artifact — a stray 2px band hanging off the
              bottom edge — rather than a deliberate detail. The mark is
              stronger as one clean die-stamp. */}
          <div
            className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--brand)] text-white"
            style={{ borderRadius: "var(--r-edge)" }}
          >
            <Braces size={19} strokeWidth={2.75} />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="flex items-baseline text-[17px] leading-none">
              <span className="font-mono font-medium tracking-[-0.02em]">
                JSON
              </span>
              <span className="font-extrabold tracking-[-0.045em]">Field</span>
            </h1>
            <p className="eyebrow mt-1.5">The JSON editor that remembers</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="relative">
            <button
              onClick={(event) => {
                event.stopPropagation();
                setThemeMenuOpen((current) => !current);
              }}
              className={`header-button ${themeMenuOpen ? "header-button-on" : ""}`}
              aria-label="Choose color theme"
              title="Choose color theme"
            >
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            {themeMenuOpen && (
              <div
                onClick={(event) => event.stopPropagation()}
                className="menu-surface absolute right-0 top-11 z-40 w-44"
              >
                <p className="eyebrow border-b border-[var(--rule)] px-3 py-2.5">
                  Color theme
                </p>
                {[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Laptop },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                      setThemeMenuOpen(false);
                    }}
                    className="menu-item"
                  >
                    <option.icon size={15} className="text-[var(--brand)]" />
                    {option.label}
                    {theme === option.value && (
                      <Check
                        size={14}
                        className="justify-self-end text-[var(--brand)]"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Three peers, three ghosts. The teal/amber pill backgrounds
              and the perpetually pulsing sparkle are gone — nav chrome
              shouldn't compete with the document for attention. */}
          <span className="mx-1.5 h-5 w-px bg-[var(--rule)]" />
          <Link
            to="/compare"
            className="header-button"
            title="Compare two JSON documents side by side"
          >
            <GitCompare size={14} /> Compare
          </Link>
          <button
            onClick={() => setTourOpen(true)}
            className="header-button"
            title="Interactive Product Walkthrough"
          >
            <Sparkles size={14} /> Tour
          </button>
          <button
            onClick={() => setFaqOpen(true)}
            className="header-button"
            title="Frequently Asked Questions Knowledge Base"
          >
            FAQ
          </button>
          <button
            onClick={() => setHelpOpen((current) => !current)}
            className={`header-button ${helpOpen ? "header-button-on" : ""}`}
            title="Help & Contact"
          >
            <CircleHelp size={14} /> Help
          </button>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-76px)] flex-col lg:flex-row">
        <div className="relative hidden lg:flex">
          {leftCollapsed ? (
            <div className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-[var(--edge)] bg-white py-5 dark:bg-[var(--surface)] dark:border-[#30363d]">
              <button
                onClick={() => setLeftCollapsed(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)] dark:hover:bg-[var(--surface-soft)] dark:hover:text-white"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen size={18} />
              </button>
              <div className="h-px w-6 bg-[var(--edge-soft)]" />
              <button
                onClick={() => {
                  setLeftCollapsed(false);
                  createDocument();
                }}
                className="rounded-lg p-2 text-[var(--brand)] transition hover:bg-[var(--brand-soft)]"
                aria-label="New document"
                title="New document"
              >
                <FilePlus2 size={18} />
              </button>
              <button
                onClick={() => {
                  setLeftCollapsed(false);
                  setActiveSection("current");
                }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)] dark:hover:bg-[var(--surface-soft)] dark:hover:text-white"
                aria-label="Current document"
                title="Current document"
              >
                <FileJson2 size={18} />
              </button>
              <button
                onClick={() => {
                  setLeftCollapsed(false);
                  setActiveSection("documents");
                }}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)] dark:hover:bg-[var(--surface-soft)] dark:hover:text-white"
                aria-label="My documents"
                title="My documents"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          ) : (
            <aside
              style={{ width: leftWidth }}
              className="flex shrink-0 flex-col border-r border-[var(--edge)] bg-white px-4 py-6 dark:bg-[var(--surface)] dark:border-[#30363d]"
            >
              <div className="mb-2 flex items-center justify-end">
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-[var(--brand)] dark:hover:bg-[var(--surface-soft)] dark:hover:text-white"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>
              <div className="relative mb-5">
                <button
                  onClick={() => setWorkspaceMenuOpen((current) => !current)}
                  className="app-focus flex w-full items-center gap-3 border border-[var(--rule)] bg-[var(--surface-soft)] p-2.5 text-left transition-colors hover:border-[var(--brand-border)]"
                  style={{ borderRadius: "var(--r-edge)" }}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center text-white ${workspace.color}`}
                    style={{ borderRadius: "var(--r-edge)" }}
                  >
                    <Building2 size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
                      {workspace.name}
                    </span>
                    <span className="eyebrow mt-1 block">{workspace.type}</span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-slate-400 transition-transform ${workspaceMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {workspaceMenuOpen && (
                  <div className="absolute left-0 right-0 top-[68px] z-30 rounded-xl border border-[var(--edge)] bg-white p-2 shadow-[0_12px_30px_rgba(23,32,51,0.12)] dark:bg-[var(--surface)] dark:border-[#30363d]">
                    <p className="px-2 pb-2 eyebrow">Switch workspace</p>
                    {workspaces.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => switchWorkspace(item.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${item.id === workspaceId ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[var(--surface-soft)]"}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${item.color}`}
                        />
                        {item.name}
                        <span className="ml-auto text-[9px] uppercase text-slate-400">
                          {item.type}
                        </span>
                      </button>
                    ))}
                    <div className="my-1 border-t border-[var(--edge-soft)]" />
                    <input
                      value={workspaceDraft}
                      onChange={(event) =>
                        setWorkspaceDraft(event.target.value)
                      }
                      onKeyDown={(event) =>
                        event.key === "Enter" && createWorkspace()
                      }
                      placeholder="New workspace name"
                      className="w-full rounded-lg border border-[var(--edge)] bg-white px-2.5 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white dark:border-[#30363d]"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setWorkspaceDraftType("Personal")}
                        className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Personal" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-slate-50 text-slate-400 dark:bg-[var(--surface-soft)]"}`}
                      >
                        Personal
                      </button>
                      <button
                        onClick={() => setWorkspaceDraftType("Team")}
                        className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${workspaceDraftType === "Team" ? "bg-[var(--violet-soft)] text-[var(--violet-ink)]" : "bg-slate-50 text-slate-400 dark:bg-[var(--surface-soft)]"}`}
                      >
                        Team
                      </button>
                    </div>
                    <button
                      onClick={createWorkspace}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--ink-solid)] py-2 text-xs font-bold text-white"
                    >
                      <Plus size={13} /> Create workspace
                    </button>
                  </div>
                )}
              </div>
              {/* Left-aligned label, square edge, no lifted glow. The
                  keyboard hint sits on the right — the control tells you
                  how to skip the control. */}
              <button
                onClick={() => createDocument()}
                className="app-focus group flex w-full items-center gap-2.5 bg-[var(--brand)] px-3.5 py-3 text-white transition-colors hover:bg-[var(--brand-hover)] dark:text-[#06201d]"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                <FilePlus2 size={16} strokeWidth={2.4} />
                <span className="chrome">New document</span>
                <span className="ml-auto font-mono text-[10px] opacity-55">
                  ⌘N
                </span>
              </button>
              <nav className="mt-7 space-y-0.5">
                <button
                  onClick={() => setActiveSection("current")}
                  className={`sidebar-link ${activeSection === "current" ? "sidebar-link-active" : ""}`}
                >
                  <FileJson2 size={15} /> Current
                </button>
                <button
                  onClick={() => setActiveSection("documents")}
                  className={`sidebar-link ${activeSection === "documents" ? "sidebar-link-active" : ""}`}
                >
                  <FolderOpen size={15} /> Documents
                </button>
              </nav>
              {/* Section header rides ON the rule, the way a drawing
                  title block sits on its border. */}
              <div className="mt-9">
                <div className="flex items-center gap-2.5">
                  <p className="eyebrow shrink-0">Recent</p>
                  <span className="h-px flex-1 bg-[var(--rule)]" />
                  <span className="tnum shrink-0 font-mono text-[10px] text-slate-400">
                    {documents.length}
                  </span>
                </div>
                <div className="mt-2.5 space-y-0.5">
                  {documents.map((document) => (
                    <button
                      key={document.name}
                      onClick={() =>
                        openDocument(document.name, document.content)
                      }
                      className={`recent-link ${documentName === document.name ? "recent-link-active" : ""}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 ${document.name.includes("webhook") ? "bg-[var(--amber-dot)]" : "bg-[var(--brand)]"}`}
                      />{" "}
                      <span className="truncate">{document.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          )}
          {!leftCollapsed && (
            <div
              onPointerDown={startDrag("left")}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="group absolute right-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"
            >
              <div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[var(--brand-border)] group-active:bg-[var(--brand)]" />
              <GripVertical
                size={12}
                className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[var(--brand-border)] group-hover:block"
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-[var(--edge)] bg-white px-5 py-3.5 xl:flex-row xl:items-center xl:justify-between xl:px-7">
            <div className="min-w-0 flex-1">
              {/* A filepath, so it's set like one: mono throughout, and
                  the filename is the only thing at full ink weight. */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400">
                <span className="text-slate-500 dark:text-slate-400">
                  {workspace.name}
                </span>
                <span className="text-[var(--rule-strong)]">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {activeSection === "documents" ? "documents" : "workspace"}
                </span>
                <span className="text-[var(--rule-strong)]">/</span>
                <div
                  className="group flex items-center gap-1.5 border-b border-dashed border-[var(--rule-strong)] px-0.5 transition-colors hover:border-[var(--brand)] focus-within:border-[var(--brand)] focus-within:border-solid"
                  title="Click to rename document"
                >
                  <input
                    aria-label="Document name"
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    className="min-w-0 max-w-[200px] truncate bg-transparent text-[12px] font-medium text-slate-800 outline-none dark:text-white"
                    placeholder="Document name"
                  />
                  <Pencil
                    size={11}
                    className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500"
                  />
                </div>
              </div>

              {/* Status reads like an instrument readout: a 2px signal
                  bar, a mono state label, then plain-spoken guidance.
                  The animate-ping halo is gone — a valid document is the
                  normal case and shouldn't throb for attention. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                {status === "valid" ? (
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-[3px] bg-emerald-500 dark:bg-emerald-400" />
                    <span className="chrome text-emerald-700 dark:text-emerald-400">
                      Valid
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="h-3.5 w-[3px] bg-rose-500" />
                    <span className="chrome flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                      <AlertCircle size={12} className="shrink-0" /> Invalid
                    </span>
                  </div>
                )}

                <span className="h-3 w-px bg-[var(--rule)]" />

                {formatMessage ? (
                  <span className="text-xs font-semibold text-[var(--brand)]">
                    {formatMessage}
                  </span>
                ) : status === "invalid" ? (
                  <span className="text-xs font-medium text-rose-500">
                    Press Format to auto-repair the structure
                  </span>
                ) : (
                  <span className="text-xs font-normal text-slate-400">
                    Press Format to repair &amp; pretty-print
                  </span>
                )}
              </div>
            </div>

            {/* ── The tool rack ──────────────────────────────────────
                Was six identically-bordered pills in a row, every one
                shouting at the same volume. Now one machined strip:
                shared enclosure, hairline seams, square ends — with
                Format as the single filled action, because formatting
                is what you actually came here to do. */}
            <div className="tool-rack">
              <button
                onClick={formatJson}
                title="Format & Auto-Repair JSON (pretty-print)"
                className="tool-button tool-button-primary"
              >
                <WandSparkles size={15} /> Format
              </button>
              <button
                onClick={saveDocument}
                title="Save Document to Workspace"
                className="tool-button"
              >
                <Check size={15} /> Save
              </button>
              <button
                onClick={() => setCompareOpen((current) => !current)}
                title="Compare with another document"
                className={`tool-button ${compareOpen ? "tool-button-on" : ""}`}
              >
                <GitCompare size={15} /> Compare
              </button>
              <button
                onClick={openHistory}
                title="View Revision History"
                className="tool-button"
              >
                <HistoryIcon size={15} /> History
              </button>
              <button
                onClick={() => shareLink(compareOpen)}
                title="Copy compressed URL snapshot link (contains JSON + Notes + Diffs)"
                className="tool-button"
              >
                <Camera size={15} /> Snapshot
              </button>
              <input
                ref={fileInputRef}
                type="file"
                // `.jsonote` stays listed alongside `.jsonfield`: sessions saved
                // before the rename must still be selectable in the picker,
                // otherwise the file a recipient is holding appears greyed out.
                accept=".json,.jsonfield,.jsonote,.csv,.txt,application/json,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importFile(file);
                  event.target.value = "";
                }}
              />
              <div className="relative flex">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setMoreOpen((current) => !current);
                  }}
                  className={`tool-button ${moreOpen ? "tool-button-on" : ""}`}
                  aria-label="More tools"
                >
                  <MoreHorizontal size={15} /> More
                </button>
                {moreOpen && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="menu-surface absolute right-0 top-11 z-40 w-[19rem]"
                  >
                    {/* The hint used to read ".json / .csv / .txt" and omit
                        the session extension — the one format a recipient of a
                        shared session is holding. The input already accepted
                        it; the label just never said so, which left "where do
                        I put this file?" unanswered. */}
                    <button
                      onClick={() => {
                        fileInputRef.current?.click();
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <Upload size={15} className="text-[var(--brand)]" />{" "}
                      Import file or session
                      <span className="menu-hint">.jsonfield.json / .csv</span>
                    </button>
                    {/* Producing a session file had NO permanent entry point:
                        it only happened automatically when a share link was
                        too long, or via a button in a toast that vanished
                        after four seconds. So the format existed but you
                        couldn't deliberately ask for one. */}
                    <button
                      onClick={() => {
                        shareAsFile(compareOpen);
                      }}
                      className="menu-item"
                    >
                      <Share2 size={15} className="text-[var(--brand)]" /> Share
                      as session file
                      <span className="menu-hint">notes + diff, any size</span>
                    </button>
                    <button
                      onClick={() => {
                        exportCsv();
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <FileSpreadsheet
                        size={15}
                        className="text-[var(--brand)]"
                      />{" "}
                      Convert to CSV
                      <span className="menu-hint">download as .csv</span>
                    </button>
                    <button
                      onClick={() => {
                        downloadJson();
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <Download size={15} className="text-[var(--brand)]" />{" "}
                      Download .json
                      {notes.length > 0 && (
                        <span className="menu-hint">with comments</span>
                      )}
                    </button>
                    {notes.length > 0 && (
                      <button
                        onClick={() => {
                          downloadPlainJson();
                          setMoreOpen(false);
                        }}
                        className="menu-item"
                      >
                        <FileText size={15} className="text-[var(--brand)]" />{" "}
                        Download plain .json
                        <span className="menu-hint">without comments</span>
                      </button>
                    )}
                    <div className="my-1 border-t border-[var(--edge-soft)]" />
                    <button
                      onClick={() => {
                        minifyJson();
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <Code2 size={15} className="text-[var(--brand)]" /> Minify
                      JSON<span className="menu-hint">compact single line</span>
                    </button>
                    <button
                      onClick={() => {
                        setSortOpen(true);
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <ArrowUpDown size={15} className="text-[var(--brand)]" />{" "}
                      Sort JSON
                      <span className="menu-hint">by field or key</span>
                    </button>
                    <button
                      onClick={() => {
                        setSchemaOpen(true);
                        setMoreOpen(false);
                      }}
                      className="menu-item"
                    >
                      <ShieldCheck size={15} className="text-[var(--brand)]" />{" "}
                      Validate schema
                      <span className="menu-hint">JSON Schema</span>
                    </button>
                    <button
                      onClick={() => {
                        setCodegenOpen(true);
                        setMoreOpen(false);
                        if (!codegenOutput) runCodegen();
                      }}
                      className="menu-item"
                    >
                      <FileCode2 size={15} className="text-[var(--brand)]" />{" "}
                      Generate code
                      <span className="menu-hint">TS, Python, Go…</span>
                    </button>
                    <button
                      onClick={() => {
                        setConvertOpen(true);
                        setMoreOpen(false);
                        setConvertDirection("to");
                        setTimeout(runConvert, 0);
                      }}
                      className="menu-item"
                    >
                      <FileJson2 size={15} className="text-[var(--brand)]" />{" "}
                      Convert format
                      <span className="menu-hint">YAML · XML · TOML</span>
                    </button>
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
                  {sharedBanner.noteCount > 0 &&
                    ` ${sharedBanner.noteCount} reference note${sharedBanner.noteCount === 1 ? "" : "s"} included.`}
                </span>
              </p>
              {sharedBanner.hasCompare && !compareOpen && (
                <button
                  onClick={() => {
                    setCompareOpen(true);
                    setView("editor");
                  }}
                  className="tool-button h-8 shrink-0 border-[var(--brand-border)] bg-white px-3 text-[11px] text-[var(--brand)]"
                >
                  <GitCompare size={14} /> Open Compare
                </button>
              )}
              <button
                onClick={() => setSharedBanner(null)}
                className="shrink-0 rounded-lg p-1.5 text-[var(--brand)] hover:bg-white/60"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-5 p-4 lg:flex-row lg:p-6">
            <section
              className={
                fullscreen
                  ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white"
                  : "relative flex h-[calc(100vh-130px)] min-h-[580px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--edge)] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]"
              }
            >
              {activeSection === "documents" && (
                <div className="absolute inset-0 z-20 overflow-auto bg-white p-6 dark:bg-[var(--surface-page)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow">{workspace.name}</p>
                      <p className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.045em] text-slate-800 dark:text-white">
                        My documents
                      </p>
                      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-slate-400">
                        Saved JSON files in this workspace. Switch workspaces
                        from the left panel.
                      </p>
                    </div>
                  </div>

                  {/* Zero documents used to render nothing at all — an
                      empty white panel under the heading, with no cue that
                      the workspace was empty rather than broken. Reachable
                      on a fresh visit and by deleting the last file. */}
                  {documents.length === 0 && (
                    <div
                      className="mt-8 border border-dashed border-[var(--rule-strong)] px-6 py-14 text-center"
                      style={{ borderRadius: "var(--r-edge)" }}
                    >
                      <FolderOpen
                        size={22}
                        className="mx-auto text-slate-300 dark:text-slate-600"
                      />
                      <p className="mt-3 text-[15px] font-bold tracking-[-0.02em] text-slate-700 dark:text-slate-200">
                        No saved documents
                      </p>
                      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-400">
                        Documents you save in {workspace.name} appear here.
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        <button
                          onClick={() => createDocument()}
                          className="app-focus chrome flex h-9 items-center gap-2 bg-[var(--brand)] px-4 text-white transition-colors hover:bg-[var(--brand-hover)] dark:text-[#06201d]"
                          style={{ borderRadius: "var(--r-edge)" }}
                        >
                          <FilePlus2 size={14} /> New document
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="app-focus chrome flex h-9 items-center gap-2 px-3 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                          style={{ borderRadius: "var(--r-edge)" }}
                        >
                          <Upload size={14} /> Import file
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    className="mt-6 grid gap-4"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(260px, 1fr))",
                    }}
                  >
                    {documents.map((doc) => (
                      <div
                        key={doc.name}
                        className="group relative flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4 transition-all hover:border-[var(--brand-border)] hover:shadow-md dark:bg-[var(--surface)] dark:hover:bg-[var(--surface-soft)]"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() =>
                                openDocument(doc.name, doc.content)
                              }
                              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-slate-800 hover:text-[var(--brand)] dark:text-white dark:hover:text-[var(--brand)]"
                            >
                              <FileJson2
                                size={18}
                                className="shrink-0 text-[var(--brand)]"
                              />
                              <span className="truncate">{doc.name}</span>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await copyText(doc.content);
                                  toast.success(
                                    `Copied ${doc.name} to clipboard!`,
                                  );
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] transition-all dark:hover:bg-[var(--edge)]"
                                title="Copy JSON payload"
                              >
                                <Copy size={14} />
                              </button>

                              {/* Was a native `confirm()`. Two reasons to
                                  drop it: it renders an OS dialog with the
                                  raw origin in it, which undoes the
                                  crafted feel instantly; and it blocks the
                                  whole renderer while open. Replaced with
                                  an inline arm-then-confirm on the card
                                  itself — destructive action still takes
                                  two deliberate clicks, no modal. */}
                              {confirmDeleteDoc === doc.name ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteDocumentRecord(doc.name);
                                      setConfirmDeleteDoc(null);
                                    }}
                                    className="app-focus chrome bg-rose-600 px-2 py-1 text-white transition-colors hover:bg-rose-500"
                                    style={{ borderRadius: "var(--r-edge)" }}
                                    title={`Permanently delete ${doc.name}`}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteDoc(null);
                                    }}
                                    className="app-focus rounded-lg p-1.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                                    aria-label="Cancel delete"
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteDoc(doc.name);
                                  }}
                                  className="app-focus rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                  title="Delete document"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="mt-2.5 text-xs text-slate-400">
                            Updated {doc.updated}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-[var(--edge-soft)] pt-3">
                          <span className="font-mono text-[10px] text-slate-400">
                            {doc.content.split("\n").length} lines ·{" "}
                            {(doc.content.length / 1024).toFixed(1)} KB
                          </span>
                          <button
                            onClick={() => openDocument(doc.name, doc.content)}
                            className="flex items-center gap-1 text-xs font-bold text-[var(--brand)] hover:underline"
                          >
                            Open{" "}
                            <ChevronDown size={14} className="-rotate-90" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {compareOpen && (
                <div className="absolute inset-0 z-10 flex flex-col bg-white">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--edge)] px-5 py-3">
                    <div className="min-w-[200px] flex-1">
                      <p className="text-sm font-bold text-slate-700">
                        Compare JSON
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Both sides are editable — changes highlight live.{" "}
                        <span className="rounded bg-amber-100 px-1">
                          changed
                        </span>{" "}
                        <span className="rounded bg-rose-100 px-1">
                          removed
                        </span>{" "}
                        <span className="rounded bg-emerald-100 px-1">
                          added
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={copyReport}
                        className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"
                      >
                        <Copy size={14} /> Copy report
                      </button>
                      <button
                        onClick={exportReport}
                        className="tool-button h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px]"
                      >
                        <Download size={14} /> Export report
                      </button>
                      <button
                        onClick={() => shareLink(true)}
                        className="tool-button h-8 shrink-0 whitespace-nowrap border-[var(--brand-border)] bg-[var(--brand-soft)] px-2.5 text-[11px] text-[var(--brand)]"
                      >
                        <Share2 size={14} /> Share comparison
                      </button>
                      <button
                        onClick={() => setCompareOpen(false)}
                        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                        aria-label="Close compare"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="grid flex-1 gap-4 overflow-auto p-4 pb-8 xl:grid-cols-2">
                    <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[var(--edge)]">
                      <div className="flex items-center justify-between border-b border-[var(--edge)] px-4 py-2.5 text-xs font-bold text-slate-600">
                        <span>Current JSON — {documentName}</span>
                        {!compareValidity.leftValid && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            Syntax error
                          </span>
                        )}
                      </div>
                      <ComparePane
                        value={json}
                        onChange={updateJson}
                        statuses={diffStatuses.left}
                        editorRef={compareCurrentRef}
                        ariaLabel="Current JSON comparison"
                      />
                    </div>
                    <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[var(--brand-border)]">
                      <div className="flex items-center justify-between border-b border-[var(--brand-soft-border)] bg-[var(--brand-soft-hover)] px-4 py-2.5 text-xs font-bold text-[var(--brand)]">
                        <span>Compare with</span>
                        {!compareValidity.rightValid && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            Syntax error
                          </span>
                        )}
                      </div>
                      <ComparePane
                        value={compareJson}
                        onChange={setCompareJson}
                        statuses={diffStatuses.right}
                        editorRef={compareRef}
                        ariaLabel="Compare JSON"
                      />
                    </div>
                    <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4 xl:col-span-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-700">
                          Differences Breakdown
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            Click any row to jump directly to it in both editor
                            panes
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${!compareValidity.bothValid ? "border-rose-200 bg-rose-50 text-rose-700" : pathDiffs.length ? "border-amber-200/80 bg-amber-50 text-amber-700" : "border-emerald-200/80 bg-emerald-50 text-emerald-700"}`}
                          >
                            {!compareValidity.bothValid
                              ? !compareValidity.leftValid &&
                                !compareValidity.rightValid
                                ? "Both documents have syntax errors"
                                : !compareValidity.leftValid
                                  ? "Current JSON has syntax errors"
                                  : "Compared JSON has syntax errors"
                              : pathDiffs.length
                                ? `${pathDiffs.filter((d) => d.kind === "changed").length} changed · ${pathDiffs.filter((d) => d.kind === "added").length} added · ${pathDiffs.filter((d) => d.kind === "removed").length} removed`
                                : "No changes"}
                          </span>
                          {!compareValidity.bothValid && (
                            <button
                              onClick={autoFixCompareSyntax}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow-xs transition-all hover:bg-rose-700 active:scale-95"
                            >
                              <WandSparkles size={13} /> Auto-fix syntax &
                              format
                            </button>
                          )}
                        </div>
                      </div>
                      {pathDiffs.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {pathDiffs.map((difference) => {
                            const targetRow = changedRows.find(
                              (row) =>
                                row.leftText.includes(
                                  `"${difference.path
                                    .split(".")
                                    .pop()
                                    ?.replace(/\[\d+\]/, "")}"`,
                                ) ||
                                row.rightText.includes(
                                  `"${difference.path
                                    .split(".")
                                    .pop()
                                    ?.replace(/\[\d+\]/, "")}"`,
                                ),
                            );
                            const lineInfo = targetRow
                              ? targetRow.leftLine
                                ? `L${targetRow.leftLine}`
                                : `L${targetRow.rightLine}`
                              : "";
                            return (
                              <button
                                key={difference.path}
                                onClick={() =>
                                  targetRow &&
                                  jumpToCompareLine(
                                    targetRow.leftLine ??
                                      targetRow.rightLine ??
                                      1,
                                    targetRow.rightLine ??
                                      targetRow.leftLine ??
                                      1,
                                  )
                                }
                                className="grid w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left text-xs transition-all hover:border-[var(--brand-border)] hover:bg-slate-50/80 sm:grid-cols-[75px_65px_1fr_1fr_1fr]"
                              >
                                <span
                                  className={`rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide ${difference.kind === "added" ? "bg-emerald-50 text-emerald-700" : difference.kind === "removed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                                >
                                  {difference.kind}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-400">
                                  {lineInfo ? `${lineInfo}` : ""}
                                </span>
                                <span className="break-all font-mono font-semibold text-[var(--brand)]">
                                  {difference.path}
                                </span>
                                <span className="break-all font-mono text-[11px] text-rose-600">
                                  − {difference.before}
                                </span>
                                <span className="break-all font-mono text-[11px] text-emerald-600">
                                  + {difference.after}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">
                          {!compareValidity.bothValid
                            ? !compareValidity.leftValid &&
                              !compareValidity.rightValid
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge)] bg-white px-5 py-2.5 dark:bg-[var(--surface)]">
                {/* ── View rail ────────────────────────────────────
                    Was a pill-inside-a-pill segmented control: a rounded
                    tray holding a rounded white chip with its own border
                    and shadow. Now flush tabs sitting directly on the
                    panel seam, active marked by a hard 2px brand
                    underline that lands exactly on that seam. Five
                    copy-pasted blocks collapsed into one mapped rail. */}
                <div className="-my-2.5 flex items-stretch">
                  {(
                    [
                      { id: "editor", label: "Editor", icon: FileCode2 },
                      { id: "tree", label: "Tree", icon: Braces },
                      { id: "query", label: "Query", icon: TerminalSquare },
                      { id: "table", label: "Table", icon: TableIcon },
                      { id: "graph", label: "Graph", icon: Sparkles },
                    ] as const
                  ).map((tab) => {
                    const active = view === tab.id && !compareOpen;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setView(tab.id);
                          setCompareOpen(false);
                        }}
                        className="app-focus chrome flex items-center gap-2 px-3.5"
                        style={{
                          height: 42,
                          color: active ? "var(--brand)" : "var(--chrome-ink)",
                          boxShadow: active
                            ? "inset 0 -2px 0 var(--brand)"
                            : "none",
                        }}
                      >
                        <tab.icon size={14} strokeWidth={active ? 2.4 : 2} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Readout side: the line count is data, so it's bare
                    tabular mono against a hairline — not a bordered
                    capsule competing with the actions. */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={copyJson}
                    className="app-focus chrome flex h-8 items-center gap-2 px-2"
                    style={{
                      color: copied ? "var(--brand)" : "var(--chrome-ink)",
                    }}
                    title="Copy JSON payload to clipboard"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <span className="h-3.5 w-px bg-[var(--rule)]" />
                  <span className="tnum font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {lineCount}{" "}
                    <span className="text-[var(--rule-strong)]">ln</span>
                  </span>
                  <span className="h-3.5 w-px bg-[var(--rule)]" />
                  <button
                    onClick={() => setFullscreen((current) => !current)}
                    className="app-focus p-1.5 text-slate-400 transition-colors hover:text-[var(--brand)]"
                    style={{ borderRadius: "var(--r-edge)" }}
                    aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                  >
                    {fullscreen ? (
                      <Minimize2 size={15} />
                    ) : (
                      <Maximize2 size={15} />
                    )}
                  </button>
                </div>
              </div>
              <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--surface-soft)]">
                {view === "query" ? (
                  <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden">
                    <div className="border-b border-[var(--edge)] bg-[var(--surface-soft)] px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <TerminalSquare
                            size={16}
                            className="absolute left-3.5 top-3 text-[var(--brand)]"
                          />
                          <input
                            value={queryText}
                            onChange={(event) =>
                              setQueryText(event.target.value)
                            }
                            placeholder="e.g. endpoints[?auth=true].name"
                            spellCheck={false}
                            className="w-full rounded-xl border border-[var(--edge)] bg-white py-2.5 pl-10 pr-24 font-mono text-sm shadow-sm outline-none transition focus:border-[var(--brand-border)] focus:shadow-[0_0_0_3px_rgba(15,118,110,0.08)]"
                          />
                          <span
                            className={`absolute right-3 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${queryResults.error ? "bg-rose-50 text-rose-600" : "bg-[var(--brand-soft)] text-[var(--brand)]"}`}
                          >
                            {queryResults.error
                              ? "invalid doc"
                              : `${queryResults.matches.length.toLocaleString()} match${queryResults.matches.length === 1 ? "" : "es"}`}
                          </span>
                        </div>
                        {queryResults.matches.length > 0 && (
                          <button
                            onClick={async () => {
                              const payload =
                                queryResults.matches.length === 1
                                  ? queryResults.matches[0].value
                                  : queryResults.matches.map((m) => m.value);
                              if (
                                await copyText(JSON.stringify(payload, null, 2))
                              )
                                toast.success("Query result copied as JSON");
                            }}
                            className="tool-button h-10 shrink-0"
                          >
                            <Copy size={14} /> Copy result
                          </button>
                        )}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="eyebrow">Try:</span>
                        {[
                          "endpoints[*].name",
                          "endpoints[?auth=true].path",
                          "settings.*",
                          "endpoints[0]",
                        ].map((example) => (
                          <button
                            key={example}
                            onClick={() => setQueryText(example)}
                            className={`rounded-md px-2 py-1 font-mono text-[10px] transition ${queryText === example ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"}`}
                          >
                            {example}
                          </button>
                        ))}
                        <span className="ml-auto hidden text-[10px] text-slate-400 sm:block">
                          dot paths · [index] · [*] · [?field=value] · &gt; &lt;
                          !=
                        </span>
                      </div>
                    </div>
                    <div className="grid flex-1 overflow-hidden lg:grid-cols-2">
                      <div className="flex min-h-[240px] flex-col overflow-hidden border-b border-[var(--edge)] lg:border-b-0 lg:border-r">
                        <div className="flex items-center justify-between border-b border-[var(--edge)] bg-white px-4 py-2">
                          <span className="eyebrow">
                            Document — {documentName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {lineCount.toLocaleString()} lines
                          </span>
                        </div>
                        <pre className="flex-1 overflow-auto bg-[var(--surface-soft)] p-4 font-mono text-xs leading-6 text-[var(--ink)]">
                          {json}
                        </pre>
                      </div>
                      <div className="flex min-h-[240px] flex-col overflow-hidden">
                        <div className="flex items-center justify-between border-b border-[var(--edge)] bg-white px-4 py-2">
                          <span className="eyebrow">Results</span>
                          {queryResults.matches.length > queryLimit && (
                            <span className="text-[10px] text-slate-400">
                              showing {queryLimit.toLocaleString()} of{" "}
                              {queryResults.matches.length.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2.5 overflow-auto bg-[var(--surface-soft)] p-4">
                          {queryResults.error && (
                            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
                              {queryResults.error}
                            </div>
                          )}
                          {!queryResults.error &&
                            queryResults.matches
                              .slice(0, queryLimit)
                              .map((match) => (
                                <div
                                  key={match.path}
                                  className="rounded-xl border border-[var(--edge-soft)] bg-white p-3 shadow-sm"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="break-all font-mono text-[10px] font-bold text-[var(--brand)]">
                                      {match.path}
                                    </p>
                                    <button
                                      onClick={async () => {
                                        if (
                                          await copyText(
                                            JSON.stringify(
                                              match.value,
                                              null,
                                              2,
                                            ),
                                          )
                                        )
                                          toast.success("Copied");
                                      }}
                                      className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-slate-50 hover:text-[var(--brand)]"
                                      aria-label="Copy this value"
                                    >
                                      <Copy size={12} />
                                    </button>
                                  </div>
                                  {typeof match.value === "string" &&
                                  /^https?:\/\/\S+$/i.test(match.value) ? (
                                    <a
                                      href={match.value}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-1.5 block break-all font-mono text-xs leading-5 text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                                    >
                                      {match.value}
                                    </a>
                                  ) : (
                                    <pre className="mt-1.5 max-h-64 overflow-auto font-mono text-xs leading-5 text-slate-600">
                                      {previewValue(match.value)}
                                    </pre>
                                  )}
                                </div>
                              ))}
                          {!queryResults.error &&
                            queryResults.matches.length > queryLimit && (
                              <button
                                onClick={() =>
                                  setQueryLimit((current) => current + 100)
                                }
                                className="w-full rounded-xl border border-dashed border-[var(--brand-border)] py-2.5 text-xs font-bold text-[var(--brand)] transition hover:bg-[var(--brand-soft-hover)]"
                              >
                                Show 100 more
                              </button>
                            )}
                          {!queryResults.error &&
                            queryResults.matches.length === 0 && (
                              <p className="py-10 text-center text-sm text-slate-400">
                                No matches for this query.
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : view === "graph" ? (
                  <JsonGraph
                    json={json}
                    dark={isDark}
                    onUpdateJson={(value) => {
                      updateJson(value);
                      setFormatMessage("");
                    }}
                    onOpenTable={() => setView("table")}
                  />
                ) : view === "table" ? (
                  <TableView
                    json={json}
                    onChange={(value) => {
                      updateJson(value);
                      setFormatMessage("");
                    }}
                  />
                ) : view === "tree" ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] bg-[var(--surface-soft)] px-4 py-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                        <Braces size={15} className="text-[var(--brand)]" />{" "}
                        Interactive structure{" "}
                        <span className="hidden sm:inline">
                          • click a value to edit it
                        </span>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <span className="mr-1 eyebrow">Levels:</span>
                        {[1, 2, 3].map((level) => (
                          <button
                            key={level}
                            onClick={() => setTreeDepth(level)}
                            className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === level ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}
                          >
                            {level}
                          </button>
                        ))}
                        <button
                          onClick={() => setTreeDepth(99)}
                          className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 99 ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}
                        >
                          Expand all
                        </button>
                        <button
                          onClick={() => setTreeDepth(0)}
                          className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${treeDepth === 0 ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 shadow-sm hover:text-[var(--brand)]"}`}
                        >
                          Collapse all
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-5">
                      {status === "valid" ? (
                        <JsonTree
                          key={`depth-${treeDepth}`}
                          label="root"
                          value={JSON.parse(json)}
                          openDepth={treeDepth}
                          onEdit={handleTreeEdit}
                        />
                      ) : (
                        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
                          Fix the JSON syntax to view the tree.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <JsonCodeEditor
                    ref={cmRef}
                    value={json}
                    onChange={(value) => {
                      updateJson(value);
                      setFormatMessage("");
                    }}
                    noteLines={notes.map((note) => note.line)}
                    onNoteClick={(line) => {
                      const target = notes.find((note) => note.line === line);
                      if (target) jumpToNote(target);
                    }}
                    onContextMenu={(line, x, y) =>
                      setContextMenu({
                        x: Math.min(x, window.innerWidth - 220),
                        y: Math.min(y, window.innerHeight - 80),
                        line,
                      })
                    }
                    dark={isDark}
                  />
                )}
                {view === "editor" && (
                  <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-[var(--edge)] bg-white/95 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm dark:bg-[var(--surface)] dark:text-slate-300 dark:border-[#30363d]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`}
                    />{" "}
                    UTF-8{" "}
                    <span className="text-slate-300 dark:text-slate-600">
                      •
                    </span>{" "}
                    Spaces: 2
                  </div>
                )}
                {contextMenu && view === "editor" && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="fixed z-50 w-52 rounded-xl border border-[var(--edge)] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)] dark:bg-[var(--surface)] dark:border-[#30363d]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                  >
                    <button
                      onClick={() => openCommentComposer(contextMenu.line)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] dark:text-slate-200"
                    >
                      <MessageSquarePlus
                        size={15}
                        className="text-[var(--brand)]"
                      />{" "}
                      Add comment on line {contextMenu.line}
                    </button>
                  </div>
                )}
              </div>
            </section>

            <div className="relative hidden lg:flex">
              {!rightCollapsed && (
                <div
                  onPointerDown={startDrag("right")}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="group absolute left-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none"
                >
                  <div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-[var(--brand-border)] group-active:bg-[var(--brand)]" />
                  <GripVertical
                    size={12}
                    className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-[var(--brand-border)] group-hover:block"
                  />
                </div>
              )}
              {rightCollapsed ? (
                <div className="flex w-11 shrink-0 flex-col items-center gap-3 rounded-2xl border border-[var(--edge)] bg-white py-5 shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
                  <button
                    onClick={() => setRightCollapsed(false)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--brand)]"
                    aria-label="Expand notes panel"
                    title="Expand notes panel"
                  >
                    <PanelRightOpen size={18} />
                  </button>
                  <div className="h-px w-6 bg-[var(--edge-soft)]" />
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--brand-soft)] text-[10px] font-bold text-[var(--brand)]">
                    {notes.length}
                  </span>
                  <button
                    onClick={() => {
                      setRightCollapsed(false);
                      openCommentComposer();
                    }}
                    className="rounded-lg p-2 text-[var(--brand)] transition hover:bg-[var(--brand-soft)]"
                    aria-label="Add reference note"
                    title="Add reference note"
                  >
                    <MessageSquarePlus size={18} />
                  </button>
                </div>
              ) : (
                <aside
                  style={{ width: rightWidth }}
                  className="panel flex h-[calc(100vh-130px)] min-h-[580px] shrink-0 flex-col overflow-hidden"
                >
                  {/* Panel head: an eyebrow above a real display heading,
                      instead of two nearly-equal grey sentences. The
                      count is bare tabular mono, not a teal bubble. */}
                  <div className="border-b border-[var(--rule)] px-5 pb-4 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="eyebrow">Annotations</p>
                        <p className="mt-1.5 text-[15px] font-extrabold tracking-[-0.035em] text-slate-800 dark:text-white">
                          Notes on this file
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="tnum font-mono text-[13px] font-medium text-slate-400">
                          {notes.length}
                        </span>
                        <button
                          onClick={() => setRightCollapsed(true)}
                          className="app-focus p-1.5 text-slate-300 transition-colors hover:text-[var(--brand)] dark:text-slate-500"
                          style={{ borderRadius: "var(--r-edge)" }}
                          aria-label="Collapse notes panel"
                          title="Collapse notes panel"
                        >
                          <PanelRightClose size={15} />
                        </button>
                      </div>
                    </div>
                    {/* Search sits underlined like a form field on paper,
                        not inside a filled rounded capsule. */}
                    <div className="relative mt-4 flex items-center gap-2 border-b border-[var(--rule)] pb-1.5 transition-colors focus-within:border-[var(--brand)]">
                      <Search size={14} className="shrink-0 text-slate-400" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search notes"
                        className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 dark:text-white"
                      />
                    </div>
                    {/* Filters are a segmented rail of mono labels with
                        superscript counts — reads like a spec sheet. */}
                    <div className="mt-3.5 flex items-center gap-4">
                      {(
                        [
                          ["all", "All", notes.length],
                          ["open", "Open", openNoteCount],
                          [
                            "resolved",
                            "Resolved",
                            notes.length - openNoteCount,
                          ],
                        ] as const
                      ).map(([value, label, count]) => (
                        <button
                          key={value}
                          onClick={() => setNoteFilter(value)}
                          className="app-focus chrome flex items-baseline gap-1 pb-1"
                          style={{
                            color:
                              noteFilter === value
                                ? "var(--brand)"
                                : "var(--chrome-ink)",
                            boxShadow:
                              noteFilter === value
                                ? "inset 0 -2px 0 var(--brand)"
                                : "none",
                          }}
                        >
                          {label}
                          <span className="tnum text-[9px] opacity-60">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes stack as a ledger: flush rows separated by
                      hairlines, not a column of floating rounded cards
                      each with its own border and shadow. */}
                  <div className="min-h-0 flex-1 divide-y divide-[var(--rule)] overflow-auto">
                    {visibleNotes.map((note) =>
                      editingNoteId === note.id ? (
                        <div
                          key={note.id}
                          className="border-l-2 border-[var(--brand)] bg-[var(--brand-soft)] p-4"
                        >
                          <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
                            <Pencil size={12} /> Editing comment on line{" "}
                            {commentLine}
                          </div>
                          <input
                            autoFocus
                            value={noteTitle}
                            onChange={(event) =>
                              setNoteTitle(event.target.value)
                            }
                            placeholder="Note title"
                            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
                          />
                          <textarea
                            value={noteText}
                            onChange={(event) =>
                              setNoteText(event.target.value)
                            }
                            placeholder="What should you remember?"
                            className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 text-slate-600 outline-none placeholder:text-slate-400 dark:text-slate-200"
                          />
                          <input
                            value={noteMention}
                            onChange={(event) =>
                              setNoteMention(event.target.value)
                            }
                            placeholder="Mention a name (optional)"
                            className="mt-1 w-full border-b border-[var(--brand-soft-border)] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400 dark:text-slate-200"
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingNoteId(null);
                                setNoteTitle("");
                                setNoteText("");
                                setNoteMention("");
                              }}
                              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-[var(--edge)]"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={addNote}
                              className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check size={13} /> Update note
                            </button>
                          </div>
                        </div>
                      ) : (
                        <article
                          key={note.id}
                          className={`group relative transition-colors ${note.resolved ? "bg-[var(--surface-soft)] opacity-70" : "bg-[var(--surface)] hover:bg-[var(--surface-soft)]"}`}
                        >
                          {/* A 2px signal edge, not a 6px candy stripe. */}
                          <div
                            className={`absolute bottom-0 left-0 top-0 w-[2px] ${note.resolved ? "bg-emerald-400" : note.color || "bg-amber-400"}`}
                          />

                          <div className="p-4 pl-[18px]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {/* Line number set like a margin
                                    reference: bare tabular mono after a
                                    hairline tick, no capsule. */}
                                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                  <span
                                    onClick={() => jumpToNote(note)}
                                    className="tnum cursor-pointer font-mono text-[10px] font-medium tracking-[0.06em] text-[var(--brand)] transition-colors hover:underline"
                                  >
                                    L{note.line}
                                  </span>
                                  {note.path && (
                                    <>
                                      <span className="h-2.5 w-px bg-[var(--rule)]" />
                                      <span className="max-w-[150px] truncate font-mono text-[10px] text-slate-400">
                                        {note.path}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p
                                    className={`cursor-pointer text-sm font-bold text-slate-800 transition hover:text-[var(--brand)] dark:text-white ${note.resolved ? "line-through decoration-slate-400" : ""}`}
                                    onClick={() => jumpToNote(note)}
                                  >
                                    {note.title}
                                  </p>
                                  {note.resolved && (
                                    <span className="chrome inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                      <CircleCheck size={11} /> Resolved
                                    </span>
                                  )}
                                </div>
                                {/* Mention reads as a byline, not a chip. */}
                                {note.mention && (
                                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--brand)]">
                                    <AtSign
                                      size={11}
                                      className="shrink-0 opacity-70"
                                    />
                                    {note.mention}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 p-0.5 opacity-80 transition group-hover:opacity-100 dark:border-[#30363d] dark:bg-[var(--surface-soft)]">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleResolve(note);
                                  }}
                                  className={`rounded-md p-1.5 transition ${note.resolved ? "bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-950/60 dark:text-emerald-300" : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"}`}
                                  aria-label={
                                    note.resolved ? "Reopen" : "Resolve"
                                  }
                                  title={
                                    note.resolved
                                      ? "Reopen note"
                                      : "Mark resolved"
                                  }
                                >
                                  <CircleCheck size={14} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setReplyingNoteId(
                                      replyingNoteId === note.id
                                        ? null
                                        : note.id,
                                    );
                                  }}
                                  className={`rounded-md p-1.5 transition ${replyingNoteId === note.id ? "bg-teal-100 text-teal-800 font-bold shadow-2xs dark:bg-teal-950/60 dark:text-teal-300" : "text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 dark:hover:text-teal-300"}`}
                                  aria-label="Reply"
                                  title="Reply to thread"
                                >
                                  <ReplyIcon size={13} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    editNote(note);
                                  }}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                                  aria-label="Edit note"
                                  title="Edit note"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setNotes((current) => {
                                      const next = current.filter(
                                        (item) => item.id !== note.id,
                                      );
                                      const docKey = `${workspaceId}:${documentName}`;
                                      setDocumentNotes((all) => ({
                                        ...all,
                                        [docKey]: next,
                                      }));
                                      return next;
                                    });
                                  }}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                  aria-label="Remove note"
                                  title="Delete note"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <p className="mt-2.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {note.text}
                            </p>

                            {note.replies && note.replies.length > 0 && (
                              <div className="mt-3.5 space-y-2 border-l-2 border-slate-200/80 pl-3 dark:border-[#30363d]">
                                {note.replies.map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-2.5 shadow-2xs dark:border-[#30363d] dark:bg-[var(--surface-soft)]"
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                                      <CornerDownRight
                                        size={12}
                                        className="shrink-0 text-slate-400"
                                      />
                                      <span>
                                        {/* The separating space has to live
                                            OUTSIDE the mention span: that span
                                            is inline-flex, and flex containers
                                            collapse trailing whitespace, so a
                                            {" "} inside it renders as
                                            "@DanConfirmed on the call". */}
                                        {reply.mention && (
                                          <>
                                            <span className="font-bold text-[var(--brand)]">
                                              @{reply.mention}
                                            </span>{" "}
                                          </>
                                        )}
                                        {reply.text}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {replyingNoteId === note.id && (
                              <div className="mt-3 rounded-2xl border border-teal-200 bg-slate-50/90 p-3 shadow-sm ring-2 ring-teal-500/10 dark:border-teal-900/60 dark:bg-[var(--surface-soft)]">
                                <textarea
                                  autoFocus
                                  value={replyText}
                                  onChange={(event) =>
                                    setReplyText(event.target.value)
                                  }
                                  placeholder="Write a reply…"
                                  className="min-h-14 w-full resize-none bg-transparent text-xs leading-5 text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                                />
                                <input
                                  value={replyMention}
                                  onChange={(event) =>
                                    setReplyMention(event.target.value)
                                  }
                                  placeholder="Mention (optional)"
                                  className="mt-1 w-full border-b border-slate-200 bg-transparent py-1 text-xs outline-none placeholder:text-slate-400 focus:border-teal-500 dark:border-[#30363d] dark:text-slate-200"
                                />
                                <div className="mt-2.5 flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setReplyingNoteId(null);
                                      setReplyText("");
                                      setReplyMention("");
                                    }}
                                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors dark:text-slate-300 dark:hover:bg-[var(--edge)]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => addReply(note.id)}
                                    className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <ReplyIcon size={13} /> Reply
                                  </button>
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => jumpToNote(note)}
                              className="mt-3.5 flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold transition-all hover:border-[var(--brand-border)] hover:bg-white hover:shadow-2xs group dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:hover:bg-[var(--surface)]"
                            >
                              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[var(--brand)]">
                                <Code2
                                  size={13}
                                  className="text-[var(--brand)]"
                                />
                                {note.path}
                              </span>
                              <span className="flex items-center gap-1 font-sans eyebrow transition-colors group-hover:text-[var(--brand)]">
                                Line {note.line}
                                <ChevronDown
                                  size={13}
                                  className="-rotate-90 transition-transform group-hover:translate-x-0.5"
                                />
                              </span>
                            </button>
                          </div>
                        </article>
                      ),
                    )}

                    {/* Two different nothings. "No matching notes" is only
                        true when a search or filter is actually hiding
                        something; on a fresh document there is nothing to
                        match yet, and saying so implies the user has
                        notes they can't see. */}
                    {visibleNotes.length === 0 &&
                      (notes.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                            No notes yet
                          </p>
                          <p className="mx-auto mt-1.5 max-w-[220px] text-xs leading-relaxed text-slate-400">
                            Right-click any line in the editor to pin a note to
                            it.
                          </p>
                        </div>
                      ) : (
                        <p className="px-5 py-10 text-center text-[13px] text-slate-400">
                          No notes match{" "}
                          {search ? "that search" : "this filter"}.
                        </p>
                      ))}

                    {showComposer && !editingNoteId ? (
                      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-soft-hover)] p-4 shadow-sm">
                        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand)]">
                          <MessageSquare size={13} /> Comment on line{" "}
                          {commentLine}
                        </div>
                        <input
                          autoFocus
                          value={noteTitle}
                          onChange={(event) => setNoteTitle(event.target.value)}
                          placeholder="Note title"
                          className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
                        />
                        <textarea
                          value={noteText}
                          onChange={(event) => setNoteText(event.target.value)}
                          placeholder="What should you remember?"
                          className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400"
                        />
                        <input
                          value={noteMention}
                          onChange={(event) =>
                            setNoteMention(event.target.value)
                          }
                          placeholder="Mention a name (optional)"
                          className="mt-2 w-full border-b border-[var(--brand-soft-border)] bg-transparent py-1.5 text-xs outline-none placeholder:text-slate-400"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setShowComposer(false);
                              setEditingNoteId(null);
                            }}
                            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={addNote}
                            className="rounded-xl bg-teal-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:bg-teal-900 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check size={13} />{" "}
                            {editingNoteId ? "Update note" : "Save note"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => openCommentComposer()}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--brand-border)] bg-[var(--brand-soft)]/40 py-3.5 text-xs font-bold text-[var(--brand)] transition-all hover:bg-[var(--brand-soft)] hover:shadow-2xs active:scale-[0.99]"
                      >
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
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-6">
            {/* Brand Column */}
            <div className="space-y-4 md:col-span-2">
              {/* Footer lockup repeats the header's die-stamp and the
                  two-typeface wordmark, so the brand reads the same at
                  both ends of the page. BETA is a mono tag, not a pill. */}
              <div className="flex items-center gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--brand)] text-white"
                  style={{ borderRadius: "var(--r-edge)" }}
                >
                  <Braces size={19} strokeWidth={2.6} />
                </span>
                <span className="flex items-baseline text-xl text-slate-900 dark:text-white">
                  <span className="font-mono font-medium tracking-[-0.02em]">
                    JSON
                  </span>
                  <span className="font-extrabold tracking-[-0.045em]">
                    Field
                  </span>
                </span>
                <span className="chrome border-l border-[var(--rule)] pl-3 text-[var(--brand)]">
                  Beta
                </span>
              </div>
              <p className="max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                A fast, secure, 100% client-side JSON editor, formatter, and
                line-annotation tool for engineering teams.
              </p>
              {/* "Made with ❤️ for developers worldwide" retired — the
                  emoji-heart signoff is stock filler. This states the one
                  thing that's actually true and differentiating. */}
              <p className="eyebrow pt-1">No server · No upload · No account</p>
              {/* The three icon buttons that sat here duplicated the
                  contact links already spelled out in the Contact
                  column. Contact details belong in one place, written
                  out, where they can be read and copied. */}
            </div>

            {/* Features Column */}
            <div className="space-y-3 text-xs">
              <h5 className="eyebrow !text-slate-800 dark:!text-slate-200">
                Product Features
              </h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li>
                  <button
                    onClick={() => setView("editor")}
                    className="hover:text-[var(--brand)]"
                  >
                    JSON Editor & Formatter
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView("tree")}
                    className="hover:text-[var(--brand)]"
                  >
                    Interactive Tree View
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setView("graph")}
                    className="hover:text-[var(--brand)]"
                  >
                    Visual Node Graph
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setCompareOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    Side-by-Side Compare
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setSchemaOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    JSON Schema Generator
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setCodegenOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    Multi-Language Codegen
                  </button>
                </li>
              </ul>
            </div>

            {/* Tools & Conversions Column */}
            <div className="space-y-3 text-xs">
              <h5 className="eyebrow !text-slate-800 dark:!text-slate-200">
                Tools & Conversions
              </h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li>
                  <button
                    onClick={() => {
                      setConvertFormatId("yaml");
                      setConvertOpen(true);
                    }}
                    className="hover:text-[var(--brand)]"
                  >
                    JSON to YAML Converter
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setConvertFormatId("xml");
                      setConvertOpen(true);
                    }}
                    className="hover:text-[var(--brand)]"
                  >
                    JSON to XML Converter
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setConvertFormatId("toml");
                      setConvertOpen(true);
                    }}
                    className="hover:text-[var(--brand)]"
                  >
                    JSON to TOML Converter
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => formatJson()}
                    className="hover:text-[var(--brand)]"
                  >
                    Auto-Repair Broken JSON
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setSortOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    Sort Keys & Values
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => shareLink(compareOpen)}
                    className="hover:text-[var(--brand)]"
                  >
                    Session Snapshot Link
                  </button>
                </li>
              </ul>
            </div>

            {/* Support Column */}
            <div className="space-y-3 text-xs">
              <h5 className="eyebrow !text-slate-800 dark:!text-slate-200">
                Support
              </h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li>
                  <button
                    onClick={() => {
                      setHelpTab("query");
                      setHelpOpen(true);
                    }}
                    className="hover:text-[var(--brand)]"
                  >
                    Submit a Query
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setHelpTab("contact");
                      setHelpOpen(true);
                    }}
                    className="hover:text-[var(--brand)]"
                  >
                    Get in Touch
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setFaqOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    Shortcuts &amp; FAQ
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setTourOpen(true)}
                    className="hover:text-[var(--brand)]"
                  >
                    Take a Tour
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact Column — absorbed from the second footer, which
                carried the only copies of the LinkedIn / GitHub / Medium
                links. They were bordered pills there; here they're plain
                links so all four columns read as one list system. */}
            <div className="space-y-3 text-xs">
              <h5 className="eyebrow !text-slate-800 dark:!text-slate-200">
                Contact
              </h5>
              <ul className="space-y-2 text-slate-500 dark:text-slate-400">
                <li>
                  <a
                    href="https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=JSONField%20Inquiry"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
                  >
                    <Mail size={13} className="shrink-0 opacity-60" /> Email
                  </a>
                </li>
                <li>
                  <a
                    href="https://linkedin.com/in/chenna-kesava-reddy-devapatla-041236216"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
                  >
                    <Globe size={13} className="shrink-0 opacity-60" /> LinkedIn{" "}
                    <ExternalLink size={10} className="shrink-0 opacity-40" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/chenna8464"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
                  >
                    <Code2 size={13} className="shrink-0 opacity-60" /> GitHub{" "}
                    <ExternalLink size={10} className="shrink-0 opacity-40" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://medium.com/@chennadvp7799"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
                  >
                    <FileText size={13} className="shrink-0 opacity-60" />{" "}
                    Medium{" "}
                    <ExternalLink size={10} className="shrink-0 opacity-40" />
                  </a>
                </li>
              </ul>
              <p className="pt-1 font-mono text-[10px] leading-relaxed text-slate-400">
                chennadvp7799@gmail.com
              </p>
            </div>
          </div>

          {/* ── Wordmark sign-off ──────────────────────────────────
              Sits in the dead space between the link columns and the
              divider, as its own block in the layout — so it's whole and
              readable rather than bleeding behind body text (the first
              version) or cropped in half by the footer edge (the second).
              Nothing overlaps it, so it can carry real presence at low
              opacity. aria-hidden: it's typographic texture, and the
              wordmark is already announced by the lockup above. */}
          <div
            aria-hidden="true"
            className="pointer-events-none mt-12 select-none text-center font-extrabold leading-[0.85] tracking-[-0.055em] text-[var(--ink)] opacity-[0.06] dark:opacity-[0.11]"
            style={{ fontSize: "clamp(56px, 13vw, 168px)" }}
          >
            JSONField
          </div>

          {/* Bottom bar. Carries the author attribution that was
              previously stranded in the second footer's copyright line. */}
          <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-[var(--rule)] pt-6 text-[11px] text-slate-400 sm:flex-row sm:items-center">
            <p>
              © {new Date().getFullYear()} JSONField by Chenna Kesava Reddy
              Devapatla.
              <span className="ml-1.5 text-slate-400/80">
                All data stays local — zero server uploads.
              </span>
            </p>
            <button
              onClick={() => {
                setHelpTab("contact");
                setHelpOpen(true);
              }}
              className="shrink-0 hover:text-[var(--brand)]"
            >
              Direct Support
            </button>
          </div>
        </div>
      </footer>

      {/* Product Walkthrough / Tour Modal */}
      {tourOpen && (
        <div
          onClick={() => setTourOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-[94vw] max-w-4xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between border-b border-[var(--edge)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    JSONField Features Walkthrough
                  </h3>
                  <p className="text-xs text-slate-400">
                    Explore core features designed for high-productivity JSON
                    editing and review.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTourOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
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
                    Real-time syntax validation, line numbers, error markers,
                    and 1-click auto-repair for trailing commas & unquoted keys.
                  </p>
                </div>
                <button
                  onClick={() => {
                    formatJson();
                    setTourOpen(false);
                  }}
                  className="mt-4 tool-button w-full justify-center text-[var(--brand)]"
                >
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
                    Right-click any line in the JSON editor to attach reference
                    notes, tag team members with `@mention`, and thread replies
                    without corrupting raw JSON.
                  </p>
                </div>
                <button
                  onClick={() => {
                    openCommentComposer();
                    setTourOpen(false);
                  }}
                  className="mt-4 tool-button w-full justify-center text-violet-600 dark:text-violet-400"
                >
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
                    Compare two JSON documents side-by-side to highlight added,
                    modified, and deleted keys instantly.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCompareOpen(true);
                    setTourOpen(false);
                  }}
                  className="mt-4 tool-button w-full justify-center text-teal-600 dark:text-teal-400"
                >
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
                    Interactive hierarchy tree and visual SVG node graph where
                    you can zoom, edit, and add/delete properties live.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setView("graph");
                    setTourOpen(false);
                  }}
                  className="mt-4 tool-button w-full justify-center text-sky-600 dark:text-sky-400"
                >
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
                    Infer Draft-07 JSON Schema and generate type-safe code
                    across TypeScript, Go, Python, Java, C#, Rust, and Swift.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCodegenOpen(true);
                    setTourOpen(false);
                    runCodegen();
                  }}
                  className="mt-4 tool-button w-full justify-center text-amber-600 dark:text-amber-400"
                >
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
                    Share your entire workspace (JSON payload + all line notes +
                    replies + compare diffs) via a compressed URL `#s=` link or
                    `.jsonfield` file.
                  </p>
                </div>
                <button
                  onClick={() => {
                    shareLink(compareOpen);
                    setTourOpen(false);
                  }}
                  className="mt-4 rounded-lg bg-[var(--brand)] py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                >
                  Copy Share Snapshot
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[var(--edge-soft)] pt-4">
              <span className="text-xs text-slate-400">
                🔒 100% Client-Side Privacy — Data never leaves your browser.
              </span>
              <button
                onClick={() => setTourOpen(false)}
                className="rounded-lg bg-[var(--brand)] px-5 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]"
              >
                Got it, let's edit!
              </button>
            </div>
          </div>
        </div>
      )}

      {faqOpen && (
        <div
          onClick={() => setFaqOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-[94vw] max-w-4xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]"
          >
            {/* FAQ Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge)] pb-4">
              {/* No icon-in-a-tinted-tile, no "Knowledge Base" badge.
                  An eyebrow, a real display heading, and a sentence. */}
              <div className="min-w-0">
                <p className="eyebrow">Knowledge base</p>
                <h3 className="mt-2 text-[24px] font-extrabold leading-none tracking-[-0.045em] text-slate-800 dark:text-white">
                  Frequently asked questions
                </h3>
                <p className="mt-2.5 max-w-lg text-xs leading-relaxed text-slate-400">
                  Features, auto-repair, privacy, and keyboard shortcuts.
                </p>
              </div>
              <button
                onClick={() => setFaqOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close FAQ"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Bar & Category Filters */}
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-3 text-slate-400"
                />
                <input
                  type="text"
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  placeholder="Search questions, features, or shortcuts"
                  className="w-full border-b border-[var(--rule)] bg-transparent py-2.5 pl-10 pr-10 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-[var(--brand)] dark:text-white"
                />
                {faqSearch && (
                  <button
                    onClick={() => setFaqSearch("")}
                    className="absolute right-3 top-2.5 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category filters. The decorative emoji are gone —
                  ⚡🛠️🔍🔄🕒🔒⌨️ on filter chips is the loudest tell of a
                  generated UI, and they carried no information the label
                  didn't already state. Counts ride as superscripts. */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1">
                {[
                  { id: "all", label: "All", count: FAQ_ITEMS.length },
                  {
                    id: "general",
                    label: "Getting started",
                    count: FAQ_ITEMS.filter((i) => i.category === "general")
                      .length,
                  },
                  {
                    id: "repair",
                    label: "Repair",
                    count: FAQ_ITEMS.filter((i) => i.category === "repair")
                      .length,
                  },
                  {
                    id: "views",
                    label: "Views & query",
                    count: FAQ_ITEMS.filter((i) => i.category === "views")
                      .length,
                  },
                  {
                    id: "convert",
                    label: "Convert & code",
                    count: FAQ_ITEMS.filter((i) => i.category === "convert")
                      .length,
                  },
                  {
                    id: "history",
                    label: "History & share",
                    count: FAQ_ITEMS.filter((i) => i.category === "history")
                      .length,
                  },
                  {
                    id: "privacy",
                    label: "Privacy",
                    count: FAQ_ITEMS.filter((i) => i.category === "privacy")
                      .length,
                  },
                  { id: "hotkeys", label: "Hotkeys", count: 8 },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFaqCategory(cat.id)}
                    className="app-focus chrome flex items-baseline gap-1 pb-1"
                    style={{
                      color:
                        faqCategory === cat.id
                          ? "var(--brand)"
                          : "var(--chrome-ink)",
                      boxShadow:
                        faqCategory === cat.id
                          ? "inset 0 -2px 0 var(--brand)"
                          : "none",
                    }}
                  >
                    {cat.label}
                    <span className="tnum text-[9px] opacity-60">
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Questions List & Content Area */}
            <div className="mt-4 min-h-0 flex-1 overflow-auto border-t border-[var(--rule)] pr-1">
              {faqCategory === "hotkeys" ? (
                <div className="pt-4">
                  <h4 className="mb-4 text-[17px] font-extrabold tracking-[-0.035em] text-slate-800 dark:text-white">
                    Keyboard shortcuts
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
                    {[
                      {
                        key: "Cmd / Ctrl + S",
                        desc: "Save document to active workspace",
                      },
                      {
                        key: "Cmd / Ctrl + Shift + F",
                        desc: "Format & Auto-Repair JSON syntax",
                      },
                      {
                        key: "Cmd / Ctrl + M",
                        desc: "Minify JSON payload to single line",
                      },
                      {
                        key: "Cmd / Ctrl + Z",
                        desc: "Undo last editor change",
                      },
                      {
                        key: "Cmd / Ctrl + Shift + Z",
                        desc: "Redo undone change",
                      },
                      {
                        key: "Cmd / Ctrl + F",
                        desc: "Find & Replace inside CodeMirror editor",
                      },
                      {
                        key: "Right-Click Line",
                        desc: "Add line reference note / comment",
                      },
                      {
                        key: "Click Tree Node",
                        desc: "Inline edit JSON AST property value",
                      },
                    ].map((hk) => (
                      /* Dot-leader rows, like an index. The binding is
                         the anchor on the right; the rule connects them. */
                      <div
                        key={hk.key}
                        className="flex items-baseline gap-2 border-b border-[var(--rule)] py-2"
                      >
                        <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">
                          {hk.desc}
                        </span>
                        <span className="h-px min-w-3 flex-1 bg-[var(--rule)]" />
                        <kbd className="shrink-0 font-mono text-[10px] font-medium tracking-[0.03em] text-[var(--brand)]">
                          {hk.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ) : filteredFaqs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search
                    size={32}
                    className="text-slate-400 mb-2 opacity-50"
                  />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    No matching questions found
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try searching for terms like "repair", "export", "notes", or
                    "privacy".
                  </p>
                  <button
                    onClick={() => {
                      setFaqSearch("");
                      setFaqCategory("all");
                    }}
                    className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-bold text-[var(--brand)] hover:bg-[var(--brand-soft-hover)]"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredFaqs.map((faq) => {
                  const isExpanded = expandedFaqId === faq.id;
                  return (
                    <div
                      key={faq.id}
                      className="border-b border-[var(--rule)] transition-colors"
                      style={{
                        boxShadow: isExpanded
                          ? "inset 2px 0 0 var(--brand)"
                          : "none",
                      }}
                    >
                      <button
                        onClick={() =>
                          setExpandedFaqId(isExpanded ? null : faq.id)
                        }
                        className="group flex w-full items-baseline justify-between gap-4 py-3.5 pl-3.5 pr-2 text-left"
                      >
                        <h4
                          className={`min-w-0 flex-1 text-[15px] font-bold leading-snug tracking-[-0.02em] transition-colors ${isExpanded ? "text-[var(--brand)]" : "text-slate-800 group-hover:text-[var(--brand)] dark:text-white"}`}
                        >
                          {faq.question}
                        </h4>
                        {/* Category demoted to a quiet mono tag on the
                              right — it labels, it doesn't announce. */}
                        <span className="eyebrow hidden shrink-0 sm:block">
                          {faq.categoryLabel}
                        </span>
                        <ChevronDown
                          size={15}
                          className={`mt-0.5 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180 text-[var(--brand)]" : ""}`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="max-w-2xl pb-4 pl-3.5 pr-8 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                          <p>{faq.answer}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--edge-soft)] pt-2.5">
                            <div className="flex flex-wrap gap-1">
                              {faq.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-[var(--edge-soft)] px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={async () => {
                                await copyText(
                                  `${faq.question}\n\n${faq.answer}`,
                                );
                                toast.success("Question & Answer copied!");
                              }}
                              className="flex items-center gap-1 text-[10px] font-bold text-[var(--brand)] hover:underline"
                            >
                              <Copy size={11} /> Copy Answer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--edge)] pt-4">
              <p className="text-xs text-slate-400">
                Can't find your answer?{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Our engineering support team is ready to help.
                </span>
              </p>
              <button
                onClick={() => {
                  setFaqOpen(false);
                  setHelpOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)] shadow-xs"
              >
                <MessageSquarePlus size={14} /> Submit Query / Contact Support
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div
          onClick={() => setHelpOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[92vh] w-[94vw] max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--edge)] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <CircleHelp size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                    Help & Support Center
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ask a question, submit feedback, or connect directly with
                    our team.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
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
                <Mail size={15} /> Get in Touch
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
              {helpTab === "query" &&
                (querySubmitted ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <CircleCheck size={36} />
                    </div>
                    <h4 className="mt-4 text-base font-bold text-slate-800 dark:text-white">
                      Query Registered & Email Prepared!
                    </h4>
                    <p className="mt-1 max-w-md text-xs text-slate-500">
                      Reference ID:{" "}
                      <span className="font-mono font-bold text-[var(--brand)]">
                        #{queryRefId}
                      </span>
                      . Destination Email:
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
                        href={`https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=${encodeURIComponent(`[JSONField Query #${queryRefId}] ${supportSubject || supportCategory}`)}&body=${encodeURIComponent(`Name: ${supportName}\nEmail: ${supportEmail}\nRef ID: #${queryRefId}\n\n${supportMessage}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                      >
                        <Send size={14} /> Open Gmail Web
                      </a>
                      <a
                        href={`mailto:chennadvp7799@gmail.com?subject=${encodeURIComponent(`[JSONField Query #${queryRefId}] ${supportSubject || supportCategory}`)}&body=${encodeURIComponent(`Name: ${supportName}\nEmail: ${supportEmail}\nRef ID: #${queryRefId}\n\n${supportMessage}`)}`}
                        className="tool-button"
                      >
                        Open Mail App
                      </a>
                      <button
                        onClick={resetSupportForms}
                        className="tool-button"
                      >
                        Submit another query
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleQuerySubmit} className="space-y-4">
                    <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] p-2.5 text-xs text-[var(--brand)]">
                      ℹ️ Queries are prefilled and sent to{" "}
                      <span className="font-mono font-bold underline">
                        chennadvp7799@gmail.com
                      </span>
                      .
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block eyebrow">Your Name *</label>
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
                        <label className="block eyebrow">Email Address *</label>
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
                        <label className="block eyebrow">Query Category</label>
                        <select
                          value={supportCategory}
                          onChange={(e) => setSupportCategory(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-border)] dark:bg-[var(--surface-soft)] dark:text-white"
                        >
                          <option value="General Query">General Query</option>
                          <option value="Bug Report">Bug Report</option>
                          <option value="Feature Request">
                            Feature Request
                          </option>
                          <option value="Enterprise / API Inquiry">
                            Enterprise / API Inquiry
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block eyebrow">Subject</label>
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
                      <label className="block eyebrow">
                        Query Details / Message *
                      </label>
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
                        onChange={(e) =>
                          setSupportIncludeJson(e.target.checked)
                        }
                        className="rounded border-[var(--edge)] text-[var(--brand)] focus:ring-0"
                      />
                      <span>
                        Attach the first 1,200 characters of my document to help
                        diagnosis
                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                          This is the only feature that sends document content
                          off your device — it travels in the Gmail compose URL,
                          so review the draft before sending.
                        </span>
                      </span>
                    </label>

                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white transition hover:bg-[var(--brand-hover)] active:scale-[0.99]"
                    >
                      <Send size={16} /> Submit Query
                    </button>
                  </form>
                ))}

              {helpTab === "contact" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Email Option */}
                    <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                            <Mail size={18} className="text-[var(--brand)]" />{" "}
                            Direct Email Support
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Send an email directly to our engineering team.
                        </p>

                        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs dark:bg-[var(--surface)]">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            chennadvp7799@gmail.com
                          </span>
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
                          href="https://mail.google.com/mail/?view=cm&fs=1&to=chennadvp7799@gmail.com&su=JSONField%20Inquiry"
                          target="_blank"
                          rel="noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]"
                        >
                          <Send size={13} /> Open Gmail Web
                        </a>
                        <a
                          href="mailto:chennadvp7799@gmail.com?subject=JSONField%20Inquiry"
                          className="flex items-center justify-center gap-1 rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:bg-[var(--surface)] dark:text-slate-200"
                        >
                          <Mail size={13} /> Mail App
                        </a>
                      </div>
                    </div>

                    {/* LinkedIn Option */}
                    <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                          <Globe size={18} className="text-sky-500" /> LinkedIn
                          Profile
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Connect on LinkedIn with Chenna Kesava Reddy
                          Devapatla.
                        </p>

                        <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs dark:bg-[var(--surface)]">
                          <span className="truncate font-mono font-bold text-slate-800 dark:text-slate-200">
                            chenna-kesava-reddy-devapatla-041236216
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await copyText(
                                "https://linkedin.com/in/chenna-kesava-reddy-devapatla-041236216",
                              );
                              toast.success(
                                "Copied LinkedIn URL to clipboard!",
                              );
                            }}
                            className="tool-button px-2 py-1 text-[10px] shrink-0 ml-1"
                          >
                            <Copy size={11} /> Copy
                          </button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <a
                          href="https://linkedin.com/in/chenna-kesava-reddy-devapatla-041236216"
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-sky-700"
                        >
                          <ExternalLink size={13} /> Open LinkedIn Profile
                        </a>
                      </div>
                    </div>

                    {/* GitHub & Medium Option */}
                    <div className="flex flex-col justify-between rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                          <Code2
                            size={18}
                            className="text-slate-700 dark:text-slate-300"
                          />{" "}
                          Developer Profiles
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Check out open-source repositories and technical
                          articles.
                        </p>

                        <div className="mt-3 space-y-1.5">
                          <a
                            href="https://github.com/chenna8464"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-[var(--brand)] dark:bg-[var(--surface)] dark:text-slate-200"
                          >
                            <span className="flex items-center gap-1.5">
                              <Code2 size={13} /> GitHub: github.com/chenna8464
                            </span>
                            <ExternalLink
                              size={11}
                              className="text-slate-400"
                            />
                          </a>
                          <a
                            href="https://medium.com/@chennadvp7799"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-lg border border-[var(--edge)] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-emerald-600 dark:bg-[var(--surface)] dark:text-slate-200"
                          >
                            <span className="flex items-center gap-1.5">
                              <FileText
                                size={13}
                                className="text-emerald-600"
                              />{" "}
                              Medium: medium.com/@chennadvp7799
                            </span>
                            <ExternalLink
                              size={11}
                              className="text-slate-400"
                            />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpTab === "faq" && (
                <div className="space-y-4">
                  {/* Why JSONField & Differentiation */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                      <Sparkles size={16} className="text-[var(--brand)]" /> Why
                      JSONField? What Makes It Different?
                    </h5>
                    <div className="mt-3 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          🔒 100% Client-Side Privacy
                        </p>
                        <p className="mt-0.5 text-slate-500">
                          Unlike typical formatters that transmit your
                          confidential JSON payloads to remote servers,
                          JSONField executes all formatting, auto-repair, schema
                          validation, and graph generation 100% locally in your
                          browser.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          💬 Contextual Line Notes & @Mentions
                        </p>
                        <p className="mt-0.5 text-slate-500">
                          Right-click any line in the JSON editor to attach
                          reference notes, tag team members with `@mention`, and
                          thread replies without corrupting or altering the raw
                          JSON payload structure.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          ⚡ Side-by-Side Diffs & Session Snapshots
                        </p>
                        <p className="mt-0.5 text-slate-500">
                          Compare JSON documents with color-coded diff
                          highlights, and share your entire session (including
                          diffs and comments) via compressed URL links or
                          portable `.jsonfield` files.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          🛠️ Auto-Repair, Schema & Code Generation
                        </p>
                        <p className="mt-0.5 text-slate-500">
                          Auto-fix trailing commas, unquoted keys, single
                          quotes, and missing brackets in 1 click. Infer
                          Draft-07 JSON Schemas and generate type-safe code
                          across TypeScript, Go, Python, Java, C#, Rust, and
                          Swift.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Core Use Cases */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                      <Braces size={16} className="text-teal-600" /> Core
                      Developer Use Cases
                    </h5>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          1. API Response Debugging
                        </p>
                        <p className="mt-1 text-slate-500">
                          Quickly format, search, filter via JSONPath, and
                          inspect deep nested API payloads.
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          2. Config Comparison
                        </p>
                        <p className="mt-1 text-slate-500">
                          Diff production vs staging environments side-by-side
                          to detect missing keys instantly.
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          3. Team Payload Review
                        </p>
                        <p className="mt-1 text-slate-500">
                          Annotate payload lines with notes and replies before
                          sharing with frontend or backend engineers.
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--edge)] bg-white p-2.5 dark:bg-[var(--surface)]">
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          4. Clean Format Conversion
                        </p>
                        <p className="mt-1 text-slate-500">
                          Convert JSON to/from clean CSV and YAML without
                          corrupting data or injecting header metadata.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Keyboard Shortcuts */}
                  <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface-soft)] p-4">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-white">
                      Keyboard Shortcuts Matrix
                    </h5>
                    <div className="mt-3 space-y-2 text-xs">
                      {[
                        ["Save / download JSON document", "⌘ S / Ctrl S"],
                        ["Format & auto-repair JSON", "Format button"],
                        ["Find & replace in editor", "⌘ F / Ctrl F"],
                        ["Fold or unfold JSON block", "click the ▾ / ▸ arrow"],
                        ["Undo / redo edit action", "⌘ Z / Ctrl Z"],
                        [
                          "Add reference note / comment on line",
                          "Right-click line in editor",
                        ],
                        [
                          "Switch between Editor / Tree / Graph",
                          "Click top tab bar",
                        ],
                      ].map(([label, keys]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between border-b border-[var(--edge-soft)] pb-2 last:border-0"
                        >
                          <span className="text-slate-600 dark:text-slate-300">
                            {label}
                          </span>
                          <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--brand)]">
                            {keys}
                          </span>
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
        <div
          onClick={() => setSortOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                Sort JSON
              </p>
              <button
                onClick={() => setSortOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {sortCandidates.length === 0 &&
            !(
              status === "valid" &&
              (() => {
                try {
                  const v = JSON.parse(json);
                  return (
                    v !== null && typeof v === "object" && !Array.isArray(v)
                  );
                } catch {
                  return false;
                }
              })()
            ) ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                This document has no array to sort, and isn't a plain object
                either. Fix the JSON syntax or open a different document.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-400">
                  Sort an array (by field, or its values directly) or sort an
                  object's keys alphabetically.
                </p>
                <label className="mt-4 block eyebrow">Target</label>
                <select
                  value={
                    sortTargetKey ?? sortCandidates[0]?.key ?? "__root_object__"
                  }
                  onChange={(event) => {
                    setSortTargetKey(event.target.value);
                    setSortField("");
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:text-white"
                >
                  {sortCandidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.key === "root" ? "Root array" : `"${c.key}" array`}
                    </option>
                  ))}
                  {(() => {
                    try {
                      const v = JSON.parse(json);
                      return (
                        v !== null && typeof v === "object" && !Array.isArray(v)
                      );
                    } catch {
                      return false;
                    }
                  })() && (
                    <option value="__root_object__">
                      Root object — sort keys A→Z
                    </option>
                  )}
                </select>
                {sortTargetKey !== "__root_object__" &&
                  (sortCandidates.find(
                    (c) => c.key === (sortTargetKey ?? sortCandidates[0]?.key),
                  )?.fields.length ?? 0) > 0 && (
                    <>
                      <label className="mt-3 block eyebrow">
                        Sort by field
                      </label>
                      <select
                        value={sortField}
                        onChange={(event) => setSortField(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:text-white"
                      >
                        <option value="">(sort values directly)</option>
                        {sortCandidates
                          .find(
                            (c) =>
                              c.key ===
                              (sortTargetKey ?? sortCandidates[0]?.key),
                          )
                          ?.fields.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                {sortTargetKey !== "__root_object__" ? (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => applySort("asc")}
                      className="tool-button flex-1 justify-center"
                    >
                      <ArrowUp size={15} /> Ascending
                    </button>
                    <button
                      onClick={() => applySort("desc")}
                      className="tool-button flex-1 justify-center"
                    >
                      <ArrowDown size={15} /> Descending
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => applySort("asc")}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white"
                  >
                    <ArrowUpDown size={15} /> Sort keys A→Z
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {schemaOpen && (
        <div
          onClick={() => setSchemaOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-[92vw] max-w-4xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                Validate against JSON Schema
              </p>
              <button
                onClick={() => setSchemaOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Paste a JSON Schema (draft-07 or newer) — validation runs entirely
              in your browser, nothing is uploaded.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={generateSchemaFromDoc}
                className="tool-button h-8 px-2.5 text-xs text-[var(--brand)]"
              >
                <WandSparkles size={13} /> Auto-generate schema from document
              </button>
              <button
                onClick={loadTestSchema}
                className="tool-button h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300"
              >
                <FileCode2 size={13} /> Load test schema with errors
              </button>
            </div>
            <textarea
              value={schemaText}
              onChange={(event) => setSchemaText(event.target.value)}
              spellCheck={false}
              className="mt-3 h-[320px] md:h-[380px] w-full resize-none rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] p-3.5 font-mono text-xs leading-5 outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:text-slate-200"
            />
            <button
              onClick={runSchemaValidation}
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--brand-hover)] active:scale-[0.99]"
            >
              <ShieldCheck size={16} /> Validate current document
            </button>
            {schemaError && (
              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-400">
                {schemaError}
              </div>
            )}
            {schemaIssues && (
              <div className="mt-3 min-h-0 flex-1 overflow-auto">
                {schemaIssues.length === 0 ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-400">
                    ✓ Document matches the schema.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {schemaIssues.map((issue, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-xs dark:border-rose-950 dark:bg-rose-950/40"
                      >
                        <span className="font-mono font-bold text-rose-700 dark:text-rose-400">
                          {issue.path}
                        </span>
                        <span className="ml-2 text-rose-600 dark:text-rose-300">
                          {issue.message}
                        </span>
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
        <div
          onClick={() => setCodegenOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                Generate code from JSON
              </p>
              <button
                onClick={() => setCodegenOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Typed models generated from your document — runs entirely in your
              browser, nothing is uploaded.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Language</span>
                <select
                  value={codegenLangIndex}
                  onChange={(event) => {
                    setCodegenLangIndex(Number(event.target.value));
                  }}
                  className="rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:text-white"
                >
                  {CODEGEN_LANGUAGES.map((lang, index) => (
                    <option key={`${lang.id}-${index}`} value={index}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Root type name</span>
                <input
                  value={codegenRootName}
                  onChange={(event) => setCodegenRootName(event.target.value)}
                  placeholder="Root"
                  className="w-40 rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:text-white"
                />
              </label>
              <button
                onClick={runCodegen}
                disabled={codegenLoading}
                className="flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {codegenLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileCode2 size={16} />
                )}{" "}
                Generate
              </button>
              {codegenOutput && !codegenLoading && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={copyCode} className="tool-button h-9">
                    <Copy size={14} /> Copy
                  </button>
                  <button onClick={downloadCode} className="tool-button h-9">
                    <Download size={14} /> Download
                  </button>
                </div>
              )}
            </div>
            {codegenError && (
              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-400">
                {codegenError}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] dark:border-[#30363d]">
              {codegenLoading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" /> Generating…
                </div>
              ) : codegenOutput ? (
                <pre className="overflow-auto p-4 font-mono text-xs leading-5 text-slate-700 dark:text-slate-200">
                  {codegenOutput}
                </pre>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  Choose a language and click Generate.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {convertOpen && (
        <div
          onClick={() => setConvertOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-800 dark:text-white">
                Convert format
              </p>
              <button
                onClick={() => setConvertOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Convert between JSON and YAML, XML, or TOML — entirely in your
              browser.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-[var(--edge)] dark:border-[#30363d]">
                <button
                  onClick={() => {
                    setConvertDirection("to");
                    setConvertOutput("");
                    setConvertError("");
                  }}
                  className={`px-3 py-1.5 text-xs font-bold transition ${convertDirection === "to" ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 dark:bg-[var(--surface-soft)] dark:text-slate-300"}`}
                >
                  JSON →
                </button>
                <button
                  onClick={() => {
                    setConvertDirection("from");
                    setConvertOutput("");
                    setConvertError("");
                  }}
                  className={`px-3 py-1.5 text-xs font-bold transition ${convertDirection === "from" ? "bg-[var(--brand)] text-white" : "bg-white text-slate-500 dark:bg-[var(--surface-soft)] dark:text-slate-300"}`}
                >
                  → JSON
                </button>
              </div>
              <select
                value={convertFormatId}
                onChange={(event) => {
                  setConvertFormatId(event.target.value as ConvertFormat);
                  setConvertOutput("");
                  setConvertError("");
                }}
                className="rounded-lg border border-[var(--edge)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:text-white"
              >
                {CONVERT_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
              </select>
              <button
                onClick={runConvert}
                className="flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
              >
                <FileJson2 size={16} /> Convert
              </button>
              {convertOutput && (
                <div className="ml-auto flex items-center gap-2">
                  {convertDirection === "from" && (
                    <button
                      onClick={loadConvertIntoEditor}
                      className="tool-button h-9 border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand)]"
                    >
                      <Check size={14} /> Load into editor
                    </button>
                  )}
                  <button onClick={copyConvert} className="tool-button h-9">
                    <Copy size={14} /> Copy
                  </button>
                  <button onClick={downloadConvert} className="tool-button h-9">
                    <Download size={14} /> Download
                  </button>
                </div>
              )}
            </div>
            {convertDirection === "from" && (
              <textarea
                value={convertInput}
                onChange={(event) => setConvertInput(event.target.value)}
                placeholder={`Paste ${convertFormatInfo().label} here…`}
                spellCheck={false}
                className="mt-3 h-32 w-full resize-none rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] p-3 font-mono text-xs outline-none focus:border-[var(--brand-border)] dark:border-[#30363d] dark:text-slate-200"
              />
            )}
            {convertError && (
              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-400">
                {convertError}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--edge)] bg-[var(--surface-soft)] dark:border-[#30363d]">
              {convertOutput ? (
                <pre className="overflow-auto p-4 font-mono text-xs leading-5 text-slate-700 dark:text-slate-200">
                  {convertOutput}
                </pre>
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                  {convertDirection === "to"
                    ? "Click Convert to turn the current JSON into " +
                      convertFormatInfo().label +
                      "."
                    : "Paste " +
                      convertFormatInfo().label +
                      " above and click Convert."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div
          onClick={() => setHistoryOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-[var(--edge)] bg-white p-6 shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-slate-800 dark:text-white">
                  Version history
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {documentName} · 30-day retention sweet spot (local)
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-teal-200/80 bg-teal-50/70 px-3.5 py-2 text-xs font-semibold text-teal-800 dark:border-teal-950 dark:bg-teal-950/40 dark:text-teal-300">
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  size={14}
                  className="text-teal-600 dark:text-teal-400"
                />{" "}
                Retention Sweet Spot: Versions from the last 30 days (up to 30
                snapshots) are kept locally.
              </span>
              <span className="font-bold">{historyVersions.length}/30</span>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              {historyVersions.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
                  <HistoryIcon size={22} className="text-[var(--brand)]" />
                  No versions yet. Edits are snapshotted automatically a couple
                  of seconds after you stop typing.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyVersions.map((version, index) => {
                    const changes = versionDiffCount(version);
                    const isCurrent = index === 0 && version.content === json;
                    return (
                      <div
                        key={version.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--edge)] p-3 transition-colors hover:border-slate-300 dark:border-[#30363d] dark:bg-[var(--surface-soft)] dark:hover:border-slate-600"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                              {relativeTime(version.savedAt)}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand)]">
                                current
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {new Date(version.savedAt).toLocaleString()} ·{" "}
                            {(version.size / 1024).toFixed(1)} KB ·{" "}
                            {version.content.split("\n").length} lines
                            {changes !== null && !isCurrent
                              ? ` · ${changes} value${changes === 1 ? "" : "s"} differ from current`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!isCurrent && (
                            <>
                              <button
                                onClick={() => compareVersion(version)}
                                className="tool-button h-8 px-2.5 text-[11px]"
                              >
                                <GitCompare size={13} /> Compare
                              </button>
                              <button
                                onClick={() => restoreVersion(version)}
                                className="tool-button h-8 px-2.5 text-[11px]"
                              >
                                <RotateCcw size={13} /> Restore
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => removeSingleVersion(version)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            aria-label="Delete this snapshot"
                            title="Delete this version"
                          >
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
                <span className="text-[11px] text-slate-400 font-medium">
                  Older versions auto-expire after 30 days.
                </span>
                <button
                  onClick={clearDocHistory}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={14} /> Clear history
                </button>
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
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${status === "valid" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"}`}
              >
                {status === "valid" ? "Valid" : "Invalid"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => formatJson()}
                className="rounded px-2 py-0.5 text-[10px] font-bold bg-sky-600 text-white hover:bg-sky-500"
              >
                Format
              </button>
              <button
                onClick={() => setFloatingWidgetOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={14} />
              </button>
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
