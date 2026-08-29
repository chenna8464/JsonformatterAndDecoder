import { compareJson, type ArrayOrder } from "@/lib/compare";
import { diffLines } from "@/lib/diff";
import { copyText } from "@/lib/share";
import {
    AlertCircle,
    ArrowLeft,
    ArrowRightLeft,
    Braces,
    Check,
    Copy,
    Equal,
    MoveVertical,
    Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type Mode = "values" | "keys" | "text";

/** Deliberately shows the reordering case: same data, different arrangement. */
const EXAMPLE_LEFT = `{
  "service": "checkout-api",
  "replicas": 2,
  "region": "eu-west-1",
  "flags": {
    "beta": true,
    "tracing": false
  }
}`;

const EXAMPLE_RIGHT = `{
  "region": "us-east-1",
  "flags": {
    "tracing": false,
    "beta": true
  },
  "service": "checkout-api",
  "replicas": 6
}`;

export default function Compare() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [arrayOrder, setArrayOrder] = useState<ArrayOrder>("strict");

  useEffect(() => {
    document.title =
      "JSONField — Side-by-Side JSON Compare & Semantic Diff Tool";
  }, []);

  const result = useMemo(
    () =>
      left.trim() && right.trim()
        ? compareJson(left, right, { arrayOrder })
        : null,
    [left, right, arrayOrder],
  );

  // `compareJson` returns one flat shape (see its CompareResult doc comment),
  // so these are plain reads rather than union narrowing.
  const failure = result?.error ?? null;
  const success = result && !result.error ? result : null;

  const textRows = useMemo(
    () => (mode === "text" && left && right ? diffLines(left, right) : []),
    [mode, left, right],
  );

  const swap = () => {
    setLeft(right);
    setRight(left);
  };

  const loadExample = () => {
    setLeft(EXAMPLE_LEFT);
    setRight(EXAMPLE_RIGHT);
  };

  const clearBoth = () => {
    setLeft("");
    setRight("");
  };

  const copyReport = async () => {
    if (!success) return;
    const lines = [
      "# JSON comparison",
      "",
      success.identical
        ? success.reorderedOnly
          ? "Same data — key order differs only."
          : "The documents are identical."
        : `${success.counts.changed} changed · ${success.counts.added} added · ${success.counts.removed} removed`,
      "",
      ...(success.values.length
        ? [
            "| Path | A | B | Change |",
            "| --- | --- | --- | --- |",
            ...success.values.map(
              (v) => `| \`${v.path}\` | ${v.before} | ${v.after} | ${v.kind} |`,
            ),
          ]
        : []),
    ];
    if (await copyText(lines.join("\n")))
      toast.success("Comparison copied as Markdown");
  };

  const paneState = (text: string, side: "left" | "right") => {
    if (!text.trim()) return { label: "Empty", tone: "muted" as const };
    if (failure && (failure.side === side || failure.side === "both")) {
      return { label: "Invalid JSON", tone: "bad" as const };
    }
    return { label: "Valid", tone: "good" as const };
  };

  const panes: {
    side: "left" | "right";
    title: string;
    value: string;
    set: (v: string) => void;
  }[] = [
    { side: "left", title: "A · Original", value: left, set: setLeft },
    { side: "right", title: "B · Revised", value: right, set: setRight },
  ];

  /**
   * One row count for BOTH panes, so they stay the same height — side-by-side
   * comparison is much harder to read when the two boxes are different sizes.
   *
   * Empty gets a generous 18 rows: with nothing pasted the panes ARE the
   * interface, so they should feel like a substantial target. Once something
   * is in them the priority inverts — the differences below matter more than
   * the input, so this caps at 14 rows and lets long documents scroll inside
   * the pane, keeping the counts and first diffs inside the viewport instead
   * of pushed under the fold.
   */
  const bothEmpty = !left.trim() && !right.trim();
  const longestSide = Math.max(
    left.split("\n").length,
    right.split("\n").length,
  );
  const paneRows = bothEmpty ? 18 : Math.min(Math.max(longestSide, 8), 14);

  return (
    <main className="blueprint-ground min-h-screen text-[var(--ink)]">
      <header className="flex h-[76px] items-center justify-between border-b border-[var(--rule)] bg-[var(--surface)] px-5 lg:px-8">
        <div className="flex items-center gap-3.5">
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
            <p className="eyebrow mt-1.5">Compare</p>
          </div>
        </div>
        <Link to="/" className="header-button">
          <ArrowLeft size={14} /> Workspace
        </Link>
      </header>

      <div className="mx-auto max-w-[1400px] px-5 py-5 lg:px-8">
        {/* Actions sit on the heading's line. The description is kept to a
            single line — at max-w-2xl the longer wording wrapped to two,
            which left a wide empty block beside it and pushed the panes
            down for no gain. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="eyebrow">Structural comparison</p>
            <h2 className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.045em]">
              Compare two documents
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={loadExample} className="header-button">
              Load example
            </button>
            <button
              onClick={swap}
              className="header-button"
              title="Swap A and B"
            >
              <ArrowRightLeft size={14} /> Swap
            </button>
            <button
              onClick={clearBoth}
              className="header-button"
              title="Clear both panes"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Differences are found by path — keys in a different order are not
          reported as changes.
        </p>

        {/* ── Input panes ─────────────────────────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {panes.map((pane) => {
            const state = paneState(pane.value, pane.side);
            const lines = pane.value ? pane.value.split("\n").length : 0;
            return (
              <section key={pane.side} className="panel flex min-w-0 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] px-4 py-2.5">
                  <p className="eyebrow">{pane.title}</p>
                  <div className="flex items-center gap-3">
                    <span className="tnum font-mono text-[11px] text-slate-400">
                      {lines}{" "}
                      <span className="text-[var(--rule-strong)]">ln</span>
                    </span>
                    <span className="h-3 w-px bg-[var(--rule)]" />
                    <span
                      className="chrome"
                      style={{
                        color:
                          state.tone === "good"
                            ? "var(--brand)"
                            : state.tone === "bad"
                              ? "#e11d48"
                              : "var(--chrome-ink)",
                      }}
                    >
                      {state.label}
                    </span>
                  </div>
                </div>
                <textarea
                  value={pane.value}
                  onChange={(event) => pane.set(event.target.value)}
                  spellCheck={false}
                  rows={paneRows}
                  placeholder={`Paste the ${pane.side === "left" ? "original" : "revised"} here…`}
                  className="w-full resize-y bg-transparent p-4 font-mono text-[12.5px] leading-6 outline-none placeholder:text-slate-400"
                />
              </section>
            );
          })}
        </div>

        {/* ── Parse error ─────────────────────────────────────────── */}
        {failure && (
          <div
            className="mt-4 flex flex-wrap items-center gap-3 border-l-2 border-rose-500 bg-rose-50 px-4 py-3 dark:bg-rose-500/10"
            style={{ borderRadius: "var(--r-edge)" }}
          >
            <AlertCircle
              size={15}
              className="shrink-0 text-rose-600 dark:text-rose-400"
            />
            <p className="min-w-0 flex-1 text-[13px] text-rose-800 dark:text-rose-300">
              <span className="font-semibold">
                {failure.side === "both"
                  ? "Both panes"
                  : failure.side === "left"
                    ? "Pane A"
                    : "Pane B"}{" "}
                could not be parsed.
              </span>
              <span className="ml-1.5 font-mono text-[12px] opacity-80">
                {failure.message}
              </span>
            </p>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────────── */}
        {success && (
          <>
            {/* The headline that fixes the pain point. When a line diff would
                have screamed "everything changed", say what is actually true. */}
            {success.reorderedOnly && (
              <div
                className="mt-5 flex flex-wrap items-center gap-3 border-l-2 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                <MoveVertical
                  size={15}
                  className="shrink-0 text-[var(--brand)]"
                />
                <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--brand)]">
                  <span className="font-semibold">
                    Same data — only the order differs.
                  </span>
                  <span className="ml-1.5 text-slate-600 dark:text-slate-300">
                    {success.counts.moved} key
                    {success.counts.moved === 1 ? "" : "s"} sit in a different
                    position, but every value matches. A line-by-line diff would
                    report these as changes.
                  </span>
                </p>
              </div>
            )}

            {success.identical && !success.reorderedOnly && (
              <div
                className="mt-5 flex items-center gap-3 border-l-2 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3"
                style={{ borderRadius: "var(--r-edge)" }}
              >
                <Equal size={15} className="shrink-0 text-[var(--brand)]" />
                <p className="text-[13px] font-semibold text-[var(--brand)]">
                  The documents are identical.
                </p>
              </div>
            )}

            <div className="panel mt-4">
              {/* Mode rail + options, same treatment as the workspace views. */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] px-4">
                <div className="-mb-px flex items-stretch">
                  {(
                    [
                      {
                        id: "text",
                        label: "Raw text",
                        hint: "Line-by-line, order sensitive",
                      },
                      {
                        id: "keys",
                        label: "Keys",
                        hint: "Which keys exist on one side only",
                      },
                      {
                        id: "values",
                        label: "Values",
                        hint: "What changed, by path",
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setMode(tab.id)}
                      className="app-focus chrome flex items-center gap-2 px-3.5"
                      style={{
                        height: 42,
                        color:
                          mode === tab.id
                            ? "var(--brand)"
                            : "var(--chrome-ink)",
                        boxShadow:
                          mode === tab.id
                            ? "inset 0 -2px 0 var(--brand)"
                            : "none",
                      }}
                      title={tab.hint}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 py-2">
                  <button
                    onClick={() =>
                      setArrayOrder((o) =>
                        o === "strict" ? "ignore" : "strict",
                      )
                    }
                    className="app-focus chrome flex items-center gap-2"
                    style={{
                      color:
                        arrayOrder === "ignore"
                          ? "var(--brand)"
                          : "var(--chrome-ink)",
                    }}
                    title="Treat arrays as unordered sets, so a moved element is not a difference"
                  >
                    <span
                      className="grid h-3.5 w-3.5 place-items-center border"
                      style={{
                        borderColor:
                          arrayOrder === "ignore"
                            ? "var(--brand)"
                            : "var(--rule-strong)",
                        background:
                          arrayOrder === "ignore"
                            ? "var(--brand)"
                            : "transparent",
                        borderRadius: "var(--r-edge)",
                      }}
                    >
                      {arrayOrder === "ignore" && (
                        <Check
                          size={10}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    Ignore array order
                  </button>
                  <span className="h-3.5 w-px bg-[var(--rule)]" />
                  <button
                    onClick={copyReport}
                    className="app-focus chrome flex items-center gap-1.5 text-[var(--chrome-ink)] transition-colors hover:text-[var(--brand)]"
                  >
                    <Copy size={13} /> Copy report
                  </button>
                </div>
              </div>

              {/* Counts readout */}
              <div className="flex flex-wrap items-center gap-4 border-b border-[var(--rule)] bg-[var(--surface-soft)] px-4 py-2.5">
                {(
                  [
                    [
                      "Changed",
                      success.counts.changed,
                      "text-amber-700 dark:text-amber-400",
                    ],
                    [
                      "Added",
                      success.counts.added,
                      "text-emerald-700 dark:text-emerald-400",
                    ],
                    [
                      "Removed",
                      success.counts.removed,
                      "text-rose-700 dark:text-rose-400",
                    ],
                    [
                      "Moved",
                      success.counts.moved,
                      "text-slate-500 dark:text-slate-400",
                    ],
                  ] as const
                ).map(([label, count, tone]) => (
                  <span
                    key={label}
                    className={`chrome flex items-baseline gap-1.5 ${count === 0 ? "text-slate-400 dark:text-slate-500" : tone}`}
                  >
                    {label}
                    <span className="tnum font-mono text-[12px]">{count}</span>
                  </span>
                ))}
              </div>

              {/* ── Values ──────────────────────────────────────── */}
              {mode === "values" && (
                <div className="divide-y divide-[var(--rule)]">
                  {success.values.length === 0 ? (
                    <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                      No value differences.
                    </p>
                  ) : (
                    <>
                      {/* Column headers. Three equal columns left short values
                          stranded mid-cell with no explanation; labelling them
                          makes the alignment read as a table, and the path
                          column now takes the width it actually needs. */}
                      <div className="hidden px-4 py-2 md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                        <span className="eyebrow">Path</span>
                        <span className="eyebrow">A · Original</span>
                        <span className="eyebrow">B · Revised</span>
                      </div>
                      {success.values.map((change) => (
                        <div
                          key={change.path}
                          className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3.5 w-[3px] shrink-0"
                              style={{
                                background:
                                  change.kind === "added"
                                    ? "#10b981"
                                    : change.kind === "removed"
                                      ? "#f43f5e"
                                      : "#f59e0b",
                              }}
                            />
                            <span className="truncate font-mono text-[12px] font-medium">
                              {change.path}
                            </span>
                            {change.typeChanged && (
                              <span className="pill-badge shrink-0 !text-amber-700 dark:!text-amber-400">
                                type
                              </span>
                            )}
                          </div>
                          <span className="min-w-0 truncate font-mono text-[12px] text-rose-700 dark:text-rose-400">
                            {change.before}
                          </span>
                          <span className="min-w-0 truncate font-mono text-[12px] text-emerald-700 dark:text-emerald-400">
                            {change.after}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ── Keys ────────────────────────────────────────── */}
              {mode === "keys" && (
                <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-[var(--rule)]">
                  {(
                    [
                      ["Only in A", success.keysOnlyInLeft, "#f43f5e"],
                      ["Only in B", success.keysOnlyInRight, "#10b981"],
                    ] as const
                  ).map(([title, keys, colour]) => (
                    <div key={title} className="min-w-0 p-4">
                      <div className="flex items-center gap-2.5">
                        <p className="eyebrow shrink-0">{title}</p>
                        <span className="h-px flex-1 bg-[var(--rule)]" />
                        <span className="tnum shrink-0 font-mono text-[11px] text-slate-400">
                          {keys.length}
                        </span>
                      </div>
                      {keys.length === 0 ? (
                        <p className="mt-3 text-[13px] text-slate-400">
                          Every key is present on both sides.
                        </p>
                      ) : (
                        <ul className="mt-3 space-y-1.5">
                          {keys.map((key) => (
                            <li
                              key={key}
                              className="flex items-center gap-2 font-mono text-[12px]"
                            >
                              <span
                                className="h-3 w-[3px] shrink-0"
                                style={{ background: colour }}
                              />
                              <span className="truncate">{key}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Raw text ────────────────────────────────────── */}
              {mode === "text" && (
                <div className="overflow-x-auto">
                  <p className="border-b border-[var(--rule)] px-4 py-2.5 text-[12px] text-slate-400">
                    Line-by-line and order sensitive — reordered keys appear
                    here as changes. Use{" "}
                    <button
                      onClick={() => setMode("values")}
                      className="font-semibold text-[var(--brand)] hover:underline"
                    >
                      Values
                    </button>{" "}
                    to ignore arrangement.
                  </p>
                  <div className="min-w-[640px] divide-y divide-[var(--rule)]">
                    {textRows.filter((row) => row.status !== "same").length ===
                    0 ? (
                      <p className="px-4 py-10 text-center text-[13px] text-slate-400">
                        No line differences.
                      </p>
                    ) : (
                      textRows
                        .filter((row) => row.status !== "same")
                        .map((row, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 px-4 py-1.5 font-mono text-[12px]"
                          >
                            <span className="tnum text-[11px] text-slate-400">
                              {row.leftLine ?? "—"}:{row.rightLine ?? "—"}
                            </span>
                            <span className="min-w-0 truncate text-rose-700 dark:text-rose-400">
                              {row.leftText}
                            </span>
                            <span className="min-w-0 truncate text-emerald-700 dark:text-emerald-400">
                              {row.rightText}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* No empty-state block here. It restated the panes' own
            placeholders and repeated the Load example button already in
            the toolbar above, so it was a tall dashed box that told the
            user nothing new. With both panes empty the page simply ends
            after them. */}
      </div>
    </main>
  );
}
