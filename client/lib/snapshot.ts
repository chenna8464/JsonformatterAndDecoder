import { gzipSync, Gunzip } from "fflate";

// A share link or snapshot file is untrusted input. Bound both the compressed
// size and the decompressed size so a crafted "zip bomb" (a tiny payload that
// expands to gigabytes) can't hang or crash the recipient's browser.
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024; // 8 MB in — a real snapshot is tiny
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024; // 64 MB out — huge for any real JSON

/** Streaming gunzip that aborts as soon as output exceeds MAX_DECOMPRESSED_BYTES. */
const boundedGunzip = (data: Uint8Array): Uint8Array => {
  if (data.length > MAX_COMPRESSED_BYTES) throw new Error("Compressed payload too large");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const gunzip = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > MAX_DECOMPRESSED_BYTES) throw new Error("Decompressed payload too large");
    chunks.push(chunk);
  });
  gunzip.push(data, true); // callback runs synchronously; an overflow throw unwinds here
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/**
 * A Session Snapshot captures everything needed to reproduce what the sharer
 * is looking at: the document, an optional comparison document, the reference
 * notes, and which view was active. The recipient restores the exact session —
 * including the live diff — from either a compressed link or a snapshot file.
 */
export type SnapshotReply = { id: number; text: string; mention: string; at: number };

export type SnapshotNote = {
  id: number;
  title: string;
  text: string;
  path: string;
  line: number;
  mention: string;
  color: string;
  resolved?: boolean;
  replies?: SnapshotReply[];
};

export type Snapshot = {
  /** schema version, so future readers can migrate old snapshots */
  v: 1;
  name: string;
  json: string;
  compare?: string;
  notes?: SnapshotNote[];
  view?: "editor" | "tree" | "query" | "table" | "graph";
  compareOpen?: boolean;
};

/** Marker that identifies a snapshot file/object vs a plain JSON document. */
export const SNAPSHOT_MARKER = "jsonote.snapshot";

const CHUNK = 0x8000;

const bytesToBinary = (bytes: Uint8Array): string => {
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return result;
};

const base64UrlEncode = (bytes: Uint8Array): string =>
  btoa(bytesToBinary(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const base64UrlDecode = (encoded: string): Uint8Array => {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const normalizeNotes = (value: unknown): SnapshotNote[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((n): n is Record<string, unknown> => n !== null && typeof n === "object")
    .map((n) => ({
      id: typeof n.id === "number" ? n.id : Date.now() + Math.floor(Math.random() * 1000),
      title: String(n.title ?? ""),
      text: String(n.text ?? ""),
      path: String(n.path ?? ""),
      line: typeof n.line === "number" ? n.line : 1,
      mention: String(n.mention ?? ""),
      color: String(n.color ?? "bg-cyan-400"),
      resolved: typeof n.resolved === "boolean" ? n.resolved : undefined,
      replies: Array.isArray(n.replies)
        ? n.replies
            .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
            .map((r) => ({
              id: typeof r.id === "number" ? r.id : Date.now() + Math.floor(Math.random() * 1000),
              text: String(r.text ?? ""),
              mention: String(r.mention ?? ""),
              at: typeof r.at === "number" ? r.at : 0,
            }))
        : undefined,
    }));
};

const coerceSnapshot = (raw: unknown): Snapshot | null => {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.json !== "string") return null;
  return {
    v: 1,
    name: typeof obj.name === "string" && obj.name ? obj.name : "shared.json",
    json: obj.json,
    compare: typeof obj.compare === "string" ? obj.compare : undefined,
    notes: normalizeNotes(obj.notes),
    view: (["editor", "tree", "query", "table", "graph"] as const).includes(obj.view as never) ? (obj.view as Snapshot["view"]) : undefined,
    compareOpen: typeof obj.compareOpen === "boolean" ? obj.compareOpen : undefined,
  };
};

/** Serialize a snapshot to a gzip-compressed base64url string. */
export function encodeSnapshot(snapshot: Snapshot): string {
  const bytes = gzipSync(new TextEncoder().encode(JSON.stringify(snapshot)));
  return base64UrlEncode(bytes);
}

/** Inverse of encodeSnapshot. Returns null on any corruption or oversized payload. */
export function decodeSnapshot(encoded: string): Snapshot | null {
  try {
    const json = new TextDecoder().decode(boundedGunzip(base64UrlDecode(encoded)));
    return coerceSnapshot(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Build a share link carrying the whole session, compressed into the URL hash. */
export function buildSnapshotLink(snapshot: Snapshot): string {
  return `${window.location.origin}${window.location.pathname}#s=${encodeSnapshot(snapshot)}`;
}

/**
 * Read a snapshot from a URL hash. Supports the new compressed `#s=` format and
 * the legacy uncompressed `#share=` format so old links keep working.
 */
export function readSnapshotFromHash(hash: string): Snapshot | null {
  const compressed = hash.match(/#s=([A-Za-z0-9_-]+)/);
  if (compressed) return decodeSnapshot(compressed[1]);

  const legacy = hash.match(/#share=([A-Za-z0-9_-]+)/);
  if (legacy) {
    try {
      const padded = legacy[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (legacy[1].length % 4)) % 4);
      const text = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
      return coerceSnapshot(JSON.parse(text));
    } catch {
      return null;
    }
  }
  return null;
}

/** A snapshot file is a JSON object tagged with our marker plus the snapshot fields. */
export function serializeSnapshotFile(snapshot: Snapshot): string {
  return JSON.stringify({ [SNAPSHOT_MARKER]: 1, ...snapshot }, null, 2);
}

/** Detect and parse a snapshot file. Returns null if the text isn't a snapshot. */
export function parseSnapshotFile(text: string): Snapshot | null {
  try {
    const obj = JSON.parse(text);
    if (obj === null || typeof obj !== "object" || !(SNAPSHOT_MARKER in obj)) return null;
    return coerceSnapshot(obj);
  } catch {
    return null;
  }
}
