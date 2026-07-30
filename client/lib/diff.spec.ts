import { describe, expect, it } from "vitest";
import { buildComparisonReport, diffLines, lineStatusMaps, valueDiffs } from "./diff";

describe("diffLines", () => {
  it("marks identical documents as all same", () => {
    const rows = diffLines("a\nb", "a\nb");
    expect(rows.every((row) => row.status === "same")).toBe(true);
  });

  it("detects changed, added, and removed lines with correct numbers", () => {
    const rows = diffLines('{\n  "a": 1,\n  "b": 2\n}', '{\n  "a": 9,\n  "b": 2,\n  "c": 3\n}');
    const changed = rows.find((row) => row.status === "changed");
    expect(changed).toMatchObject({ leftLine: 2, rightLine: 2 });
    const added = rows.filter((row) => row.status === "added");
    expect(added.length).toBeGreaterThan(0);
  });

  it("aligns unchanged lines after an insertion", () => {
    const rows = diffLines("one\ntwo\nthree", "one\ninserted\ntwo\nthree");
    const two = rows.find((row) => row.leftText === "two" && row.status === "same");
    expect(two).toMatchObject({ leftLine: 2, rightLine: 3 });
  });
});

describe("lineStatusMaps", () => {
  it("maps per-side statuses", () => {
    const rows = diffLines("a\nremoved-line\nb", "a\nb\nadded-line");
    const { left, right } = lineStatusMaps(rows);
    expect(left.get(2)).toBeDefined();
    expect(right.get(3)).toBeDefined();
    expect(left.get(1)).toBeUndefined();
  });
});

describe("valueDiffs", () => {
  it("classifies changed, added, and removed paths", () => {
    const diffs = valueDiffs({ a: 1, b: 2 }, { a: 9, c: 3 });
    expect(diffs).toEqual([
      { path: "a", before: "1", after: "9", kind: "changed" },
      { path: "b", before: "2", after: "—", kind: "removed" },
      { path: "c", before: "—", after: "3", kind: "added" },
    ]);
  });
});

describe("buildComparisonReport", () => {
  it("includes summary, path table, changed lines, and both documents", () => {
    const left = '{\n  "a": 1\n}';
    const right = '{\n  "a": 2\n}';
    const rows = diffLines(left, right);
    const report = buildComparisonReport({
      documentName: "sample.json",
      leftJson: left,
      rightJson: right,
      rows,
      values: valueDiffs(JSON.parse(left), JSON.parse(right)),
    });
    expect(report).toContain("# JSON comparison report — sample.json");
    expect(report).toContain("| `a` | 1 | 2 | changed |");
    expect(report).toContain("## Changed lines");
    expect(report).toContain("## Current JSON");
    expect(report).toContain("## Compared JSON");
  });

  it("falls back to line-level documentation when a document is invalid JSON", () => {
    const left = '{\n  "a": 1\n}';
    const right = '{\n  "a": 2\n'; // invalid — unclosed
    const report = buildComparisonReport({
      documentName: "sample.json",
      leftJson: left,
      rightJson: right,
      rows: diffLines(left, right),
      values: null,
    });
    expect(report).toContain("not valid JSON");
    expect(report).toContain("## Changed lines");
    expect(report).not.toContain("Differences by path");
  });
});
