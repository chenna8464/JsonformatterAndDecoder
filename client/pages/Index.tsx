import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  Download,
  FileJson2,
  FilePlus2,
  FolderOpen,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
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

type Note = { id: number; title: string; text: string; path: string; line: number; color: string };

type FormatResult = { value: string; repaired: boolean };

const repairJson = (source: string): FormatResult => {
  let value = source.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/([{,]\s*)([A-Za-z0-9_$-]+)(\s*:)/g, '$1"$2"$3').replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1');
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (character === '"' && !escaped) inString = !inString;
    if (!inString && (character === '{' || character === '[')) stack.push(character === '{' ? '}' : ']');
    if (!inString && (character === '}' || character === ']') && stack[stack.length - 1] === character) stack.pop();
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  if (inString) value += '"';
  while (stack.length) value += stack.pop();
  try {
    return { value: JSON.stringify(JSON.parse(value), null, 2), repaired: value !== source };
  } catch {
    return { value: source, repaired: false };
  }
};

const starterNotes: Note[] = [
  {
    id: 1,
    title: "Confirm production limits",
    text: "Check whether this needs to be raised before the partner launch.",
    path: "settings.rateLimit",
    line: 20,
    color: "bg-amber-400",
  },
  {
    id: 2,
    title: "API versioning",
    text: "Consider a v2 route before we add bulk updates here.",
    path: "endpoints[1]",
    line: 14,
    color: "bg-violet-400",
  },
];

export default function Index() {
  const [json, setJson] = useState(initialJson);
  const [status, setStatus] = useState<"valid" | "invalid">("valid");
  const [notes, setNotes] = useState<Note[]>(starterNotes);
  const [noteText, setNoteText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [formatMessage, setFormatMessage] = useState("");
  const [commentLine, setCommentLine] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = useMemo(() => json.split("\n").length, [json]);

  const updateJson = (value: string) => {
    setJson(value);
    try {
      JSON.parse(value);
      setStatus("valid");
    } catch {
      setStatus("invalid");
    }
  };

  const formatJson = () => {
    const result = repairJson(json);
    if (result.value === json) {
      setStatus("invalid");
      setFormatMessage("Could not safely repair this JSON");
      return;
    }
    setJson(result.value);
    setStatus("valid");
    setFormatMessage(result.repaired ? "Repaired and formatted" : "Formatted");
  };

  const minifyJson = () => {
    const result = repairJson(json);
    if (result.value === json) {
      setStatus("invalid");
      setFormatMessage("Could not safely repair this JSON");
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
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "northstar-api.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const jumpToNote = (note: Note) => {
    const lines = json.split("\n");
    const lineIndex = Math.max(0, Math.min(lines.length - 1, note.line - 1));
    const pathSegments = note.path.split(/[.[]/).filter(Boolean);
    const segment = pathSegments[pathSegments.length - 1]?.replace("]", "") || note.path;
    const fallbackLineIndex = lines.findIndex((line) => line.toLowerCase().includes(segment.toLowerCase()));
    const targetLineIndex = lines[note.line - 1]?.toLowerCase().includes(segment.toLowerCase()) ? lineIndex : fallbackLineIndex;
    const editor = editorRef.current;
    if (!editor || targetLineIndex < 0) return;
    const lineHeight = 25;
    const start = lines.slice(0, targetLineIndex).join("\n").length + (targetLineIndex ? 1 : 0);
    editor.focus();
    editor.setSelectionRange(start, start + lines[targetLineIndex].length);
    editor.scrollTop = Math.max(0, targetLineIndex * lineHeight - editor.clientHeight / 3);
  };

  const openCommentComposer = (lineOverride?: number) => {
    const editor = editorRef.current;
    const cursor = editor?.selectionStart ?? 0;
    const line = lineOverride ?? json.slice(0, cursor).split("\n").length;
    setCommentLine(line);
    setContextMenu(null);
    setShowComposer(true);
  };

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener("click", closeContextMenu);
    return () => document.removeEventListener("click", closeContextMenu);
  }, []);

  const addNote = () => {
    if (!noteText.trim()) return;
    const lineText = json.split("\n")[commentLine - 1] || "";
    const key = lineText.match(/"([^"\\]+)"\s*:/)?.[1] || `line ${commentLine}`;
    setNotes((current) => [
      ...current,
      {
        id: Date.now(),
        title: noteTitle.trim() || "Untitled note",
        text: noteText.trim(),
        path: key,
        line: commentLine,
        color: "bg-cyan-400",
      },
    ]);
    setNoteTitle("");
    setNoteText("");
    setShowComposer(false);
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
          <button className="header-button"><CircleHelp size={17} /> Help</button>
          <button className="header-button"><MoreHorizontal size={18} /></button>
          <div className="ml-2 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#9b8cff] to-[#6257e8] text-xs font-bold text-white">AV</div>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-76px)] flex-col lg:flex-row">
        <aside className="hidden w-[232px] shrink-0 border-r border-[#e9eaf2] bg-white px-4 py-6 lg:block">
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-[#5149da]">
            <FilePlus2 size={17} /> New document
          </button>
          <nav className="mt-7 space-y-1">
            <button className="sidebar-link sidebar-link-active"><FileJson2 size={17} /> Current document</button>
            <button className="sidebar-link"><FolderOpen size={17} /> My documents</button>
          </nav>
          <div className="mt-9 border-t border-[#eef0f5] pt-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent</p>
            <button className="recent-link"><span className="h-2 w-2 rounded-full bg-[#0f766e]" /> northstar-api.json</button>
            <button className="recent-link"><span className="h-2 w-2 rounded-full bg-[#ffb64d]" /> webhook-payload.json</button>
          </div>
          <div className="mt-auto rounded-xl bg-[#f3f2ff] px-4 py-4 text-sm text-[#4d46c9]">
            <Sparkles size={18} className="mb-2" />
            <p className="font-bold">Keep context close.</p>
            <p className="mt-1 text-xs leading-5 text-[#716bd2]">Notes stay attached to the structure they explain.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-[#e6e8f0] bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between xl:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-400"><FileJson2 size={16} /> Workspace <span>/</span> <span className="truncate font-semibold text-slate-700">northstar-api.json</span></div>
              <div className="mt-1.5 flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`} /><span className={`text-xs font-semibold ${status === "valid" ? "text-emerald-600" : "text-rose-600"}`}>{status === "valid" ? "Valid JSON" : "Invalid JSON"}</span>{formatMessage ? <span className="text-xs font-semibold text-[#0f766e]">{formatMessage}</span> : <span className="text-xs text-slate-400">Click Format to repair common mistakes</span>}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={formatJson} className="tool-button"><WandSparkles size={16} /> Format</button>
              <button onClick={() => openCommentComposer()} className="tool-button"><MessageSquarePlus size={16} /> Add comment</button>
              <button onClick={minifyJson} className="tool-button"><Code2 size={16} /> Minify</button>
              <button onClick={copyJson} className="tool-button">{copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</button>
              <button onClick={downloadJson} className="grid h-9 w-9 place-items-center rounded-lg bg-[#172033] text-white transition hover:bg-slate-700" aria-label="Download JSON"><Download size={16} /></button>
            </div>
          </div>

          <div className="grid flex-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
            <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
              <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-3">
                <div className="flex items-center gap-4"><span className="tab-active">Editor</span><span className="text-sm font-semibold text-slate-400">Tree view</span></div>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-400"><span>{lineCount} lines</span><button className="text-slate-500 hover:text-slate-900"><Maximize2 size={16} /></button></div>
              </div>
              <div className="relative flex flex-1 bg-[#fcfcfe]">
                <div className="select-none border-r border-[#eff1f6] bg-[#f7f8fb] px-2 pt-5 font-mono text-[13px] leading-[25px] text-slate-300">{Array.from({ length: lineCount }, (_, index) => { const line = index + 1; const lineNotes = notes.filter((note) => note.line === line); return <div key={line} className="flex h-[25px] items-center justify-end gap-2"><span>{line}</span>{lineNotes.length > 0 && <button onClick={() => jumpToNote(lineNotes[0])} className="text-[#0f766e] transition hover:scale-125" aria-label={`Comment on line ${line}`}><MessageSquare size={13} fill="currentColor" /></button>}</div>; })}</div>
                <textarea ref={editorRef} aria-label="JSON editor" value={json} onChange={(event) => { updateJson(event.target.value); setFormatMessage(""); }} onContextMenu={(event) => { event.preventDefault(); const editor = event.currentTarget; const rect = editor.getBoundingClientRect(); const line = Math.max(1, Math.min(lineCount, Math.floor((event.clientY - rect.top + editor.scrollTop - 20) / 25) + 1)); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 80), line }); }} spellCheck={false} className="min-h-[520px] flex-1 resize-none bg-transparent px-5 py-5 font-mono text-[13px] leading-[25px] text-[#33415c] outline-none" />
                <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-[#e6e7ef] bg-white/95 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm"><span className={`h-1.5 w-1.5 rounded-full ${status === "valid" ? "bg-emerald-500" : "bg-rose-500"}`} /> UTF-8 <span className="text-slate-300">•</span> Spaces: 2</div>
                {contextMenu && <div onClick={(event) => event.stopPropagation()} className="fixed z-50 w-52 rounded-xl border border-[#dce6e5] bg-white p-1.5 shadow-[0_12px_35px_rgba(15,118,110,0.18)]" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={() => openCommentComposer(contextMenu.line)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-[#e6f7f4] hover:text-[#0f766e]"><MessageSquarePlus size={15} className="text-[#0f766e]" /> Add comment on line {contextMenu.line}</button></div>}
              </div>
            </section>

            <aside className="rounded-2xl border border-[#e3e6ef] bg-white shadow-[0_8px_30px_rgba(38,42,70,0.04)]">
              <div className="border-b border-[#edf0f4] px-5 pb-4 pt-5">
                <div className="flex items-center justify-between"><div><p className="text-base font-bold tracking-[-0.025em]">Reference notes</p><p className="mt-1 text-xs text-slate-400">Context for future you.</p></div><span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#e6f7f4] px-1 text-xs font-bold text-[#0f766e]">{notes.length}</span></div>
                <div className="relative mt-4"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" className="w-full rounded-lg border border-[#e6e8f0] bg-[#fafbfc] py-2 pl-9 pr-3 text-xs outline-none transition focus:border-[#8f88ec]" /></div>
              </div>
              <div className="space-y-3 p-4">
                {visibleNotes.map((note) => <article key={note.id} onClick={() => jumpToNote(note)} className="group relative cursor-pointer rounded-xl border border-[#ebeaf2] p-4 transition hover:border-[#cfcced] hover:shadow-sm"><span className={`absolute left-0 top-4 h-8 w-1 rounded-r ${note.color}`} /><button onClick={(event) => { event.stopPropagation(); setNotes((current) => current.filter((item) => item.id !== note.id)); }} className="absolute right-2 top-2 hidden rounded p-1 text-slate-400 hover:bg-slate-100 group-hover:block" aria-label="Remove note"><X size={14} /></button><p className="pl-2 text-sm font-bold text-slate-700">{note.title}</p><p className="mt-2 pl-2 text-xs leading-5 text-slate-500">{note.text}</p><div className="mt-3 flex items-center gap-1.5 pl-2 font-mono text-[10px] text-[#0f766e]"><ChevronDown size={12} /> {note.path} <span className="ml-auto font-sans text-[10px] font-bold uppercase tracking-wide text-slate-400">Jump to line</span></div></article>)}
                {visibleNotes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No matching notes.</p>}
                {showComposer ? <div className="rounded-xl border border-[#9ed3c8] bg-[#f4fbfa] p-3"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#0f766e]"><MessageSquare size={13} /> Comment on line {commentLine}</div><input autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400" /><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="What should you remember?" className="mt-2 min-h-16 w-full resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-slate-400" /><div className="mt-2 flex justify-end gap-2"><button onClick={() => setShowComposer(false)} className="text-xs font-semibold text-slate-500">Cancel</button><button onClick={addNote} className="rounded-md bg-[#0f766e] px-2.5 py-1.5 text-xs font-bold text-white">Save note</button></div></div> : <button onClick={() => openCommentComposer()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#9ed3c8] py-3 text-sm font-bold text-[#0f766e] transition hover:bg-[#f4fbfa]"><MessageSquarePlus size={16} /> Add reference note</button>}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
