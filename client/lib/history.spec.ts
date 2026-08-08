import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, getVersion, listVersions, saveVersion, shouldSaveVersion, versionsToPrune, type Version } from "./history";

const mk = (id: number, savedAt: number, content = "x"): Version => ({ id, docKey: "d", name: "d.json", content, savedAt, size: 1 });

describe("shouldSaveVersion", () => {
  it("skips empty content", () => {
    expect(shouldSaveVersion("   ", undefined)).toBe(false);
  });
  it("skips content identical to the latest version", () => {
    expect(shouldSaveVersion("same", mk(1, 1, "same"))).toBe(false);
  });
  it("saves new content", () => {
    expect(shouldSaveVersion("new", mk(1, 1, "old"))).toBe(true);
    expect(shouldSaveVersion("first", undefined)).toBe(true);
  });
});

describe("versionsToPrune", () => {
  it("returns nothing when under the cap", () => {
    expect(versionsToPrune([mk(1, 1), mk(2, 2)], 5)).toEqual([]);
  });
  it("returns the ids of the oldest versions beyond the cap", () => {
    const vs = [mk(1, 10), mk(2, 20), mk(3, 30), mk(4, 40)];
    expect(versionsToPrune(vs, 2).sort()).toEqual([1, 2]);
  });
});

describe("history storage (fake IndexedDB)", () => {
  beforeEach(async () => {
    await clearHistory("doc");
  });

  it("saves and lists versions newest-first", async () => {
    await saveVersion("doc", "doc.json", '{"a":1}', 1000);
    await saveVersion("doc", "doc.json", '{"a":2}', 2000);
    const list = await listVersions("doc");
    expect(list.map((v) => v.content)).toEqual(['{"a":2}', '{"a":1}']);
    expect(list[0].size).toBeGreaterThan(0);
  });

  it("skips saving a duplicate of the latest version", async () => {
    await saveVersion("doc", "doc.json", '{"a":1}', 1000);
    const dup = await saveVersion("doc", "doc.json", '{"a":1}', 2000);
    expect(dup).toBeNull();
    expect((await listVersions("doc")).length).toBe(1);
  });

  it("retrieves a version by id", async () => {
    const v = await saveVersion("doc", "doc.json", '{"a":9}', 1000);
    const fetched = await getVersion(v!.id as number);
    expect(fetched?.content).toBe('{"a":9}');
  });

  it("isolates versions per document key", async () => {
    await saveVersion("doc", "doc.json", "a", 1000);
    await saveVersion("other", "other.json", "b", 1000);
    expect((await listVersions("doc")).length).toBe(1);
    expect((await listVersions("other")).length).toBe(1);
  });
});
