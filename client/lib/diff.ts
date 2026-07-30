export type LineStatus = "same" | "added" | "removed" | "changed";

export type DiffRow = {
  leftLine: number | null;
  rightLine: number | null;
  leftText: string;
  rightText: string;
  status: LineStatus;
};

/**
 * Align two documents line-by-line using LCS so unchanged lines pair up and
 * insertions/deletions/edits are detected precisely.
 */
export function diffLines(left: string, right: string): DiffRow[] {
  const a = left.split("\n");
  const b = right.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS is O(n*m); beyond this cap fall back to index pairing.
  if (n * m > 4_000_000) {
    return Array.from({ length: Math.max(n, m) }, (_, i) => ({
      leftLine: i < n ? i + 1 : null,
      rightLine: i < m ? i + 1 : null,
      leftText: a[i] ?? "",
      rightText: b[i] ?? "",
      status: (a[i] ?? "").trim() === (b[i] ?? "").trim() ? "same" : i >= n ? "added" : i >= m ? "removed" : "changed",
    }));
  }

  const eq = (x: string, y: string) => x.trim() === y.trim();
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  let pendingLeft: number[] = [];
  let pendingRight: number[] = [];

  const flushPending = () => {
    // Pair up deletions and insertions as "changed" rows; leftovers are pure
    // removed/added lines.
    const pairs = Math.min(pendingLeft.length, pendingRight.length);
    for (let k = 0; k < pairs; k++) {
      rows.push({ leftLine: pendingLeft[k] + 1, rightLine: pendingRight[k] + 1, leftText: a[pendingLeft[k]], rightText: b[pendingRight[k]], status: "changed" });
    }
    for (let k = pairs; k < pendingLeft.length; k++) {
      rows.push({ leftLine: pendingLeft[k] + 1, rightLine: null, leftText: a[pendingLeft[k]], rightText: "", status: "removed" });
    }
    for (let k = pairs; k < pendingRight.length; k++) {
      rows.push({ leftLine: null, rightLine: pendingRight[k] + 1, leftText: "", rightText: b[pendingRight[k]], status: "added" });
    }
    pendingLeft = [];
    pendingRight = [];
  };

  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      flushPending();
      rows.push({ leftLine: i + 1, rightLine: j + 1, leftText: a[i], rightText: b[j], status: "same" });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      pendingLeft.push(i++);
    } else {
      pendingRight.push(j++);
    }
  }
  while (i < n) pendingLeft.push(i++);
  while (j < m) pendingRight.push(j++);
  flushPending();
  return rows;
}

/** Per-side line status maps for editor highlighting (1-indexed line → status). */
export function lineStatusMaps(rows: DiffRow[]): { left: Map<number, LineStatus>; right: Map<number, LineStatus> } {
  const left = new Map<number, LineStatus>();
  const right = new Map<number, LineStatus>();
  for (const row of rows) {
    if (row.status === "same") continue;
    if (row.leftLine !== null) left.set(row.leftLine, row.status === "added" ? "changed" : row.status);
    if (row.rightLine !== null) right.set(row.rightLine, row.status === "removed" ? "changed" : row.status);
  }
  return { left, right };
}

export const flattenJson = (value: unknown, path = ""): Record<string, string> => {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return { [path || "value"]: Array.isArray(value) ? "[]" : "{}" };
    return entries.reduce(
      (result, [key, child]) => Object.assign(result, flattenJson(child, path ? `${path}.${key}` : key)),
      {} as Record<string, string>,
    );
  }
  return { [path || "value"]: JSON.stringify(value) };
};

export type ValueDiff = { path: string; before: string; after: string; kind: "added" | "removed" | "changed" };

/** Structural (path-level) differences between two parsed JSON values. */
export function valueDiffs(left: unknown, right: unknown): ValueDiff[] {
  const a = flattenJson(left);
  const b = flattenJson(right);
  const paths = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return paths
    .filter((path) => a[path] !== b[path])
    .map((path) => ({
      path,
      before: a[path] ?? "—",
      after: b[path] ?? "—",
      kind: a[path] === undefined ? "added" : b[path] === undefined ? "removed" : "changed",
    }));
}

export type ReportInput = {
  documentName: string;
  leftLabel?: string;
  rightLabel?: string;
  leftJson: string;
  rightJson: string;
  rows: DiffRow[];
  /** null when one or both documents are not valid JSON (structural diff unavailable) */
  values: ValueDiff[] | null;
  generatedAt?: string;
};

/** Build a shareable markdown comparison report ("documentation"). */
export function buildComparisonReport(input: ReportInput): string {
  const { documentName, leftJson, rightJson, rows, values } = input;
  const leftLabel = input.leftLabel ?? "Current";
  const rightLabel = input.rightLabel ?? "Compared";
  const changedRows = rows.filter((row) => row.status !== "same");
  const lineCounts = {
    changed: changedRows.filter((r) => r.status === "changed").length,
    added: changedRows.filter((r) => r.status === "added").length,
    removed: changedRows.filter((r) => r.status === "removed").length,
  };

  const summary =
    values === null
      ? changedRows.length
        ? `${changedRows.length} changed line${changedRows.length === 1 ? "" : "s"} (${lineCounts.changed} changed · ${lineCounts.added} added · ${lineCounts.removed} removed)`
        : "No line-level differences."
      : values.length
        ? `${values.filter((v) => v.kind === "changed").length} value(s) changed · ${values.filter((v) => v.kind === "added").length} added · ${values.filter((v) => v.kind === "removed").length} removed`
        : "No differences — the documents match.";

  const lines: string[] = [
    `# JSON comparison report — ${documentName}`,
    "",
    ...(input.generatedAt ? [`_Generated: ${input.generatedAt}_`, ""] : []),
    `**Documents:** ${leftLabel} (${leftJson.split("\n").length} lines) vs ${rightLabel} (${rightJson.split("\n").length} lines)`,
    "",
    `**Summary:** ${summary}`,
    "",
  ];

  if (values === null) {
    lines.push("> ⚠️ One or both documents are not valid JSON, so a structural (path-level) comparison was not possible. The line-level changes below are still accurate.", "");
  }

  if (values && values.length) {
    lines.push("## Differences by path", "", `| Path | ${leftLabel} | ${rightLabel} | Type |`, "| --- | --- | --- | --- |");
    const escape = (text: string) => text.replace(/\|/g, "\\|");
    for (const diff of values) {
      lines.push(`| \`${escape(diff.path)}\` | ${escape(diff.before)} | ${escape(diff.after)} | ${diff.kind} |`);
    }
    lines.push("");
  }

  if (changedRows.length) {
    lines.push("## Changed lines", "");
    for (const row of changedRows) {
      if (row.status === "removed") lines.push(`- **Line ${row.leftLine}** removed from ${leftLabel}: \`${row.leftText.trim()}\``);
      else if (row.status === "added") lines.push(`- **Line ${row.rightLine}** added in ${rightLabel}: \`${row.rightText.trim()}\``);
      else lines.push(`- **Line ${row.leftLine} → ${row.rightLine}**: \`${row.leftText.trim()}\` → \`${row.rightText.trim()}\``);
    }
    lines.push("");
  }

  lines.push(`## ${leftLabel} JSON`, "", "```json", leftJson, "```", "", `## ${rightLabel} JSON`, "", "```json", rightJson, "```", "");
  return lines.join("\n");
}
