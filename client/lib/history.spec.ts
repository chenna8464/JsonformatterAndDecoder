import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, deleteVersion, getVersion, listVersions, saveVersion, shouldSaveVersion, versionsToPrune, type Version } from "./history";

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
  it("returns nothing when under the cap and within retention window", () => {
    const now = 50 * 86400 * 1000;
    const vs = [mk(1, now - 1000), mk(2, now - 2000)];
    expect(versionsToPrune(vs, 5, 30 * 86400 * 1000, now)).toEqual([]);
  });

  it("returns the ids of the oldest versions beyond the cap", () => {
    const now = 50 * 86400 * 1000;
    const vs = [mk(1, now - 4000), mk(2, now - 3000), mk(3, now - 2000), mk(4, now - 1000)];
    expect(versionsToPrune(vs, 2, 30 * 86400 * 1000, now).sort()).toEqual([1, 2]);
  });

  it("prunes versions older than 30 days retention limit", () => {
    const now = 100 * 86400 * 1000;
    const fresh = mk(1, now - 10 * 86400 * 1000); // 10 days old
    const expired = mk(2, now - 40 * 86400 * 1000); // 40 days old
    expect(versionsToPrune([fresh, expired], 10, 30 * 86400 * 1000, now)).toEqual([2]);
  });
});

describe("history storage (fake IndexedDB)", () => {
  const now = Date.now();

  beforeEach(async () => {
    await clearHistory("doc");
    await clearHistory("other");
  });

  it("saves and lists versions newest-first", async () => {
    await saveVersion("doc", "doc.json", '{"a":1}', now - 2000);
    await saveVersion("doc", "doc.json", '{"a":2}', now - 1000);
    const list = await listVersions("doc", now);
    expect(list.map((v) => v.content)).toEqual(['{"a":2}', '{"a":1}']);
    expect(list[0].size).toBeGreaterThan(0);
  });

  it("skips saving a duplicate of the latest version", async () => {
    await saveVersion("doc", "doc.json", '{"a":1}', now - 2000);
    const dup = await saveVersion("doc", "doc.json", '{"a":1}', now - 1000);
    expect(dup).toBeNull();
    expect((await listVersions("doc", now)).length).toBe(1);
  });

  it("retrieves a version by id", async () => {
    const v = await saveVersion("doc", "doc.json", '{"a":9}', now - 1000);
    const fetched = await getVersion(v!.id as number);
    expect(fetched?.content).toBe('{"a":9}');
  });

  it("deletes a single version by id", async () => {
    const v1 = await saveVersion("doc", "doc.json", '{"a":1}', now - 2000);
    const v2 = await saveVersion("doc", "doc.json", '{"a":2}', now - 1000);
    await deleteVersion(v1!.id as number);
    const list = await listVersions("doc", now);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(v2!.id);
  });

  it("isolates versions per document key", async () => {
    await saveVersion("doc", "doc.json", "a", now - 1000);
    await saveVersion("other", "other.json", "b", now - 1000);
    expect((await listVersions("doc", now)).length).toBe(1);
    expect((await listVersions("other", now)).length).toBe(1);
  });
});
