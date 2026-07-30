import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap, gutter, GutterMarker } from "@codemirror/view";
import { EditorState, Compartment, RangeSet, RangeSetBuilder } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { foldGutter, foldKeymap, bracketMatching, syntaxHighlighting, HighlightStyle, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";

export type JsonCodeEditorHandle = {
  jumpToLine: (line: number) => void;
  getCursorLine: () => number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  noteLines: number[];
  onNoteClick: (line: number) => void;
  onContextMenu: (line: number, x: number, y: number) => void;
};

const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "#1d4ed8", fontWeight: "600" },
  { tag: tags.string, color: "#15803d" },
  { tag: tags.number, color: "#dc2626" },
  { tag: tags.bool, color: "#d97706", fontWeight: "600" },
  { tag: tags.null, color: "#7c3aed", fontWeight: "600" },
  { tag: tags.separator, color: "#64748b" },
  { tag: tags.bracket, color: "#475569" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "25px", overflow: "auto" },
  ".cm-content": { padding: "16px 0" },
  ".cm-line": { padding: "0 16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "#f7f8fb", borderRight: "1px solid #eff1f6", color: "#b6bdcc" },
  ".cm-activeLineGutter": { backgroundColor: "#eef4f3", color: "#0f766e" },
  ".cm-activeLine": { backgroundColor: "rgba(15, 118, 110, 0.04)" },
  ".cm-foldGutter .cm-gutterElement": { cursor: "pointer", color: "#8a94a6" },
  ".cm-foldPlaceholder": { backgroundColor: "#e6f7f4", border: "1px solid #9ed3c8", color: "#0f766e", borderRadius: "4px", padding: "0 6px", margin: "0 4px" },
  ".cm-selectionMatch": { backgroundColor: "#fef3c7" },
});

class NoteMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("span");
    el.textContent = "●";
    el.title = "Jump to comment";
    el.style.cssText = "color:#0f766e;cursor:pointer;font-size:9px;";
    return el;
  }
}

const noteMarker = new NoteMarker();

const buildNoteGutter = (noteLines: number[], onNoteClick: (line: number) => void) =>
  gutter({
    class: "cm-note-gutter",
    markers: (view) => {
      const builder = new RangeSetBuilder<GutterMarker>();
      const sorted = [...new Set(noteLines)].sort((a, b) => a - b);
      for (const line of sorted) {
        if (line >= 1 && line <= view.state.doc.lines) {
          builder.add(view.state.doc.line(line).from, view.state.doc.line(line).from, noteMarker);
        }
      }
      return builder.finish();
    },
    initialSpacer: () => noteMarker,
    domEventHandlers: {
      mousedown: (view, block) => {
        const line = view.state.doc.lineAt(block.from).number;
        if (noteLines.includes(line)) {
          onNoteClick(line);
          return true;
        }
        return false;
      },
    },
  });

const JsonCodeEditor = forwardRef<JsonCodeEditorHandle, Props>(function JsonCodeEditor(
  { value, onChange, noteLines, onNoteClick, onContextMenu },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const notesCompartment = useRef(new Compartment());
  const callbacks = useRef({ onChange, onNoteClick, onContextMenu });
  callbacks.current = { onChange, onNoteClick, onContextMenu };

  useEffect(() => {
    if (!containerRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          notesCompartment.current.of(buildNoteGutter(noteLines, (line) => callbacks.current.onNoteClick(line))),
          foldGutter({ openText: "▾", closedText: "▸" }),
          history(),
          json(),
          syntaxHighlighting(jsonHighlight),
          bracketMatching(),
          indentOnInput(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
          editorTheme,
        ],
      }),
    });
    view.dom.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;
      callbacks.current.onContextMenu(view.state.doc.lineAt(pos).number, event.clientX, event.clientY);
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (Format, Import, opening a document) — sync into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  // Notes changed — rebuild the note gutter.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: notesCompartment.current.reconfigure(buildNoteGutter(noteLines, (line) => callbacks.current.onNoteClick(line))),
    });
  }, [noteLines]);

  useImperativeHandle(ref, () => ({
    jumpToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const target = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, line)));
      view.dispatch({
        selection: { anchor: target.from, head: target.to },
        effects: EditorView.scrollIntoView(target.from, { y: "center" }),
      });
      view.focus();
    },
    getCursorLine: () => {
      const view = viewRef.current;
      if (!view) return 1;
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    },
  }));

  return <div ref={containerRef} className="h-full min-h-0 flex-1 overflow-hidden" />;
});

export default JsonCodeEditor;
