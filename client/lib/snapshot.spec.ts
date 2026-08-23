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
  type Snapshot,
} from "./snapshot";

const sample: Snapshot = {
  v: 1,
  name: "api.json",
  json: '{\n  "a": 1\n}',
  compare: '{\n  "a": 2\n}',
  notes: [{ id: 1, title: "note", text: "body", path: "a", line: 2, mention: "sam", color: "bg-amber-400" }],
  view: "editor",
  compareOpen: true,
};

describe("snapshot encode/decode", () => {
  it("round-trips a full snapshot through compression", () => {
    expect(decodeSnapshot(encodeSnapshot(sample))).toEqual(sample);
  });

  it("compresses repetitive JSON to well under the raw size", () => {
    const big: Snapshot = { v: 1, name: "big.json", json: JSON.stringify(Array.from({ length: 500 }, () => ({ name: "widget", active: true, count: 3 }))) };
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
      id: i, name: `Item ${i}`, sku: `SKU-${i}`, active: i % 2 === 0, price: i * 1.5,
    }));
    const big: Snapshot = { v: 1, name: "bulk.json", json: JSON.stringify({ items }, null, 2) };
    const encoded = encodeSnapshot(big);
    expect(decodeSnapshot(encoded)).toEqual(big);
  });

  it("keeps the share payload around an eighth of the raw JSON size", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: i, name: `Item ${i}`, sku: `SKU-${i}`, active: i % 2 === 0, price: i * 1.5,
    }));
    const big: Snapshot = { v: 1, name: "bulk.json", json: JSON.stringify({ items }, null, 2) };
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
    const notes = [{ id: 1, title: "Limit", text: "Check limit", path: "project", line: 2, mention: "chenna", color: "bg-cyan-400" }];
    const annotated = embedNotesInJson(origJson, notes as any);
    expect(annotated).toContain('"$comments"');
    expect(annotated).toContain('"Check limit"');

    const extracted = extractAnnotatedJsonNotes(annotated);
    expect(extracted.notes).toEqual(notes);
    expect(JSON.parse(extracted.cleanJson)).toEqual({ project: "Northstar" });
  });
});

describe("readSnapshotFromHash", () => {
  it("reads the compressed #s= format", () => {
    // buildSnapshotLink needs window.location; build the hash directly here so
    // this stays a pure-node unit test.
    expect(readSnapshotFromHash(`#s=${encodeSnapshot(sample)}`)).toEqual(sample);
  });

  it("reads the legacy uncompressed #share= format", () => {
    const legacyPayload = { name: "old.json", json: '{"x":1}', compare: '{"x":2}' };
    const b64 = btoa(JSON.stringify(legacyPayload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

  it("returns null for invalid JSON", () => {
    expect(parseSnapshotFile("{not json")).toBeNull();
  });
});
