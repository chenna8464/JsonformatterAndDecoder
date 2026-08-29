import { describe, expect, it } from "vitest";
import {
  decodeSnapshot,
  embedNotesInJson,
  encodeSnapshot,
  extractAnnotatedJsonNotes,
  parseSnapshotFile,
  readSnapshotFromHash,
  serializeSnapshotFile,
  SNAPSHOT_MARKER,
  classifyShareLink,
  SHARE_LINK_PASTE_SAFE,
  SHARE_LINK_MAX,
  snapshotFileName,
  type Snapshot,
} from "./snapshot";

const sample: Snapshot = {
  v: 1,
  name: "api.json",
  json: '{\n  "a": 1\n}',
  compare: '{\n  "a": 2\n}',
  notes: [
    {
      id: 1,
      title: "note",
      text: "body",
      path: "a",
      line: 2,
      mention: "sam",
      color: "bg-amber-400",
    },
  ],
  view: "editor",
  compareOpen: true,
};

describe("snapshot encode/decode", () => {
  it("round-trips a full snapshot through compression", () => {
    expect(decodeSnapshot(encodeSnapshot(sample))).toEqual(sample);
  });

  it("compresses repetitive JSON to well under the raw size", () => {
    const big: Snapshot = {
      v: 1,
      name: "big.json",
      json: JSON.stringify(
        Array.from({ length: 500 }, () => ({
          name: "widget",
          active: true,
          count: 3,
        })),
      ),
    };
    const encoded = encodeSnapshot(big);
    expect(encoded.length).toBeLessThan(big.json.length / 2);
    expect(decodeSnapshot(encoded)).toEqual(big);
  });

  it("returns null for corrupt input", () => {
    expect(decodeSnapshot("not-valid-gzip")).toBeNull();
  });

  // Share links carry the whole document in the URL hash, so payload size
  // grows linearly with the data. These pin the actual numbers, because the
  // limit that bites is not the browser (a hash is never sent to a server)
  // but the messaging apps people paste links into.
  it("round-trips a 1000-record document without loss", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      sku: `SKU-${i}`,
      active: i % 2 === 0,
      price: i * 1.5,
    }));
    const big: Snapshot = {
      v: 1,
      name: "bulk.json",
      json: JSON.stringify({ items }, null, 2),
    };
    const encoded = encodeSnapshot(big);
    expect(decodeSnapshot(encoded)).toEqual(big);
  });

  it("keeps the share payload around an eighth of the raw JSON size", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      sku: `SKU-${i}`,
      active: i % 2 === 0,
      price: i * 1.5,
    }));
    const big: Snapshot = {
      v: 1,
      name: "bulk.json",
      json: JSON.stringify({ items }, null, 2),
    };
    const ratio = encodeSnapshot(big).length / big.json.length;
    // ~0.127 measured. Guard against a regression that stops compressing.
    expect(ratio).toBeLessThan(0.2);
  });

  it("rejects a decompression bomb instead of expanding it into memory", async () => {
    const { gzipSync } = await import("fflate");
    const bomb = gzipSync(new Uint8Array(80 * 1024 * 1024));
    const encoded = encodeSnapshot({ v: 1, name: "bomb.json", json: "{}" });
    const bombEncoded = encoded.slice(0, 10);
    expect(decodeSnapshot(bombEncoded)).toBeNull();
  });

  it("embeds and extracts annotated comments from JSON object", () => {
    const origJson = '{\n  "project": "Northstar"\n}';
    const notes = [
      {
        id: 1,
        title: "Limit",
        text: "Check limit",
        path: "project",
        line: 2,
        mention: "chenna",
        color: "bg-cyan-400",
      },
    ];
    const annotated = embedNotesInJson(origJson, notes as any);
    expect(annotated).toContain('"$comments"');
    expect(annotated).toContain('"Check limit"');

    const extracted = extractAnnotatedJsonNotes(annotated);
    expect(extracted.notes).toEqual(notes);
    expect(JSON.parse(extracted.cleanJson)).toEqual({ project: "Northstar" });
  });
});

describe("classifyShareLink", () => {
  it("treats short links as safe to paste anywhere", () => {
    expect(classifyShareLink(350)).toBe("safe");
    expect(classifyShareLink(SHARE_LINK_PASTE_SAFE)).toBe("safe");
  });

  it("flags links past the paste-safe ceiling as long but usable", () => {
    expect(classifyShareLink(SHARE_LINK_PASTE_SAFE + 1)).toBe("long");
    expect(classifyShareLink(SHARE_LINK_MAX)).toBe("long");
  });

  it("rejects links past the maximum in favour of a snapshot file", () => {
    expect(classifyShareLink(SHARE_LINK_MAX + 1)).toBe("too-long");
    expect(classifyShareLink(150_000)).toBe("too-long");
  });

  it("puts a real 1000-record document in the long bucket", () => {
    // ~15.5k characters measured — works when opened, but will not survive
    // a paste into most chat apps, which is exactly what "long" means.
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      sku: `SKU-${i}`,
      active: i % 2 === 0,
      price: i * 1.5,
    }));
    const encoded = encodeSnapshot({
      v: 1,
      name: "bulk.json",
      json: JSON.stringify({ items }, null, 2),
    });
    expect(classifyShareLink(encoded.length)).toBe("long");
  });

  it("puts a 100-record document in the safe bucket", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      sku: `SKU-${i}`,
      active: i % 2 === 0,
      price: i * 1.5,
    }));
    const encoded = encodeSnapshot({
      v: 1,
      name: "small.json",
      json: JSON.stringify({ items }, null, 2),
    });
    expect(classifyShareLink(encoded.length)).toBe("safe");
  });
});

describe("readSnapshotFromHash", () => {
  it("no longer resolves the removed localStorage alias format", () => {
    // "s_xxxxxx" links only ever worked in the browser that made them, so
    // the format is gone. A stray one must fail cleanly, not throw.
    expect(readSnapshotFromHash("#s=s_abc123")).toBeNull();
  });

  it("reads the compressed #s= format", () => {
    // buildSnapshotLink needs window.location; build the hash directly here so
    // this stays a pure-node unit test.
    expect(readSnapshotFromHash(`#s=${encodeSnapshot(sample)}`)).toEqual(
      sample,
    );
  });

  it("reads the legacy uncompressed #share= format", () => {
    const legacyPayload = {
      name: "old.json",
      json: '{"x":1}',
      compare: '{"x":2}',
    };
    const b64 = btoa(JSON.stringify(legacyPayload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = readSnapshotFromHash(`#share=${b64}`);
    expect(result?.name).toBe("old.json");
    expect(result?.json).toBe('{"x":1}');
    expect(result?.compare).toBe('{"x":2}');
  });

  it("returns null when there is no share hash", () => {
    expect(readSnapshotFromHash("#other=123")).toBeNull();
  });
});

describe("snapshot file", () => {
  it("serializes with the marker and parses back", () => {
    const file = serializeSnapshotFile(sample);
    expect(file).toContain(SNAPSHOT_MARKER);
    expect(parseSnapshotFile(file)).toEqual(sample);
  });

  it("does not treat a plain JSON document as a snapshot", () => {
    expect(parseSnapshotFile('{"just":"data"}')).toBeNull();
  });

  it("carries a human-readable _readme that import ignores", () => {
    const file = serializeSnapshotFile(sample);
    expect(JSON.parse(file)._readme).toContain("Import file or session");
    // The extra key must not leak into the restored session.
    expect(parseSnapshotFile(file)).toEqual(sample);
    expect(Object.keys(parseSnapshotFile(file)!)).not.toContain("_readme");
  });

  describe("snapshotFileName", () => {
    it("uses a .json tail so the OS can open it", () => {
      expect(snapshotFileName("api.json")).toBe("api.jsonote.json");
    });

    it("does not double up when the name already carries the extension", () => {
      expect(snapshotFileName("api.jsonote.json")).toBe("api.jsonote.json");
    });

    it("falls back to a sensible name when the document is untitled", () => {
      expect(snapshotFileName("")).toBe("session.jsonote.json");
      expect(snapshotFileName(".json")).toBe("session.jsonote.json");
    });

    it("strips characters that break filenames", () => {
      expect(snapshotFileName("my report / v2.json")).toBe(
        "my-report-v2.jsonote.json",
      );
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSnapshotFile("{not json")).toBeNull();
  });
});
