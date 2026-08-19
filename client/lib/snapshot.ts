import { deflateSync, inflateSync, gzipSync, Gunzip } from "fflate";

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
  let cleaned = encoded;
  try {
    cleaned = decodeURIComponent(encoded);
  } catch {
    cleaned = encoded;
  }
  cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

export const normalizeNotes = (value: unknown): SnapshotNote[] | undefined => {
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

/**
 * Extracts embedded notes (comments & replies) from a JSON object if present
 * under `$comments`, `_comments`, or `$jsonote.notes`.
 * Returns the cleaned JSON string (without the metadata property) and the extracted notes.
 */
export function extractAnnotatedJsonNotes(text: string): { cleanJson: string; notes: SnapshotNote[] | null } {
  try {
    const obj = JSON.parse(text);
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      return { cleanJson: text, notes: null };
    }

    const rawObj = obj as Record<string, unknown>;
    const rawNotes = rawObj.$comments ?? rawObj._comments ?? (rawObj.$jsonote && typeof rawObj.$jsonote === "object" ? (rawObj.$jsonote as Record<string, unknown>).notes : undefined);
    const parsedNotes = normalizeNotes(rawNotes);

    if (!parsedNotes || parsedNotes.length === 0) {
      return { cleanJson: text, notes: null };
    }

    const copy = { ...rawObj };
    delete copy.$comments;
    delete copy._comments;
    delete copy.$jsonote;

    return {
      cleanJson: JSON.stringify(copy, null, 2),
      notes: parsedNotes,
    };
  } catch {
    return { cleanJson: text, notes: null };
  }
}

/**
 * Embeds notes (comments & replies) into a JSON object as a top-level `$comments` property
 * for portable export.
 */
export function embedNotesInJson(jsonText: string, notes: SnapshotNote[]): string {
  if (!notes || notes.length === 0) return jsonText;
  try {
    const obj = JSON.parse(jsonText);
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      return jsonText;
    }
    const annotated = {
      $comments: notes,
      ...obj,
    };
    return JSON.stringify(annotated, null, 2);
  } catch {
    return jsonText;
  }
}

const compactNotesToNotes = (t: unknown): SnapshotNote[] | undefined => {
  if (!Array.isArray(t)) return undefined;
  return t.map((item) => {
    if (Array.isArray(item)) {
      const [id, title, text, path, line, mention, color, resolved, replies] = item;
      const note: SnapshotNote = {
        id: typeof id === "number" ? id : Date.now(),
        title: String(title ?? ""),
        text: String(text ?? ""),
        path: String(path ?? ""),
        line: typeof line === "number" ? line : 1,
        mention: String(mention ?? ""),
        color: String(color ?? "bg-amber-400"),
      };
      if (resolved === 1 || resolved === true) note.resolved = true;
      if (Array.isArray(replies) && replies.length > 0) {
        note.replies = replies.map((r) => {
          if (Array.isArray(r)) {
            const [rId, rText, rMention, rAt] = r;
            return {
              id: typeof rId === "number" ? rId : Date.now(),
              text: String(rText ?? ""),
              mention: String(rMention ?? ""),
              at: typeof rAt === "number" ? rAt : 0,
            };
          }
          return { id: Date.now(), text: String((r as SnapshotReply)?.text ?? ""), mention: String((r as SnapshotReply)?.mention ?? ""), at: Number((r as SnapshotReply)?.at ?? 0) };
        });
      }
      return note;
    }
    return item as SnapshotNote;
  });
};

const coerceSnapshot = (raw: unknown): Snapshot | null => {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const jsonStr = typeof obj.j === "string" ? obj.j : typeof obj.json === "string" ? obj.json : null;
  if (jsonStr === null) return null;

  const name = typeof obj.n === "string" && obj.n ? obj.n : typeof obj.name === "string" && obj.name ? obj.name : "shared.json";
  const compare = typeof obj.c === "string" ? obj.c : typeof obj.compare === "string" ? obj.compare : undefined;
  const notesRaw = obj.t !== undefined ? compactNotesToNotes(obj.t) : normalizeNotes(obj.notes);
  const view = (["editor", "tree", "query", "table", "graph"] as const).includes((obj.w ?? obj.view) as never) ? ((obj.w ?? obj.view) as Snapshot["view"]) : undefined;
  const compareOpen = typeof obj.o === "number" ? obj.o === 1 : typeof obj.compareOpen === "boolean" ? obj.compareOpen : undefined;

  const result: Snapshot = { v: 1, name, json: jsonStr };
  if (compare !== undefined) result.compare = compare;
  if (notesRaw !== undefined) result.notes = notesRaw;
  if (view !== undefined) result.view = view;
  if (compareOpen !== undefined) result.compareOpen = compareOpen;
  return result;
};

/** Serialize a snapshot to an ultra-compact raw-deflate base64url string. */
export function encodeSnapshot(snapshot: Snapshot): string {
  const compact: Record<string, unknown> = {
    v: 1,
    n: snapshot.name,
    j: snapshot.json,
  };
  if (snapshot.compare !== undefined) compact.c = snapshot.compare;
  if (snapshot.notes !== undefined) {
    compact.t = snapshot.notes.map((n) => [
      n.id,
      n.title,
      n.text,
      n.path,
      n.line,
      n.mention,
      n.color,
      n.resolved ? 1 : 0,
      n.replies?.map((r) => [r.id, r.text, r.mention, r.at]),
    ]);
  }
  if (snapshot.view !== undefined) compact.w = snapshot.view;
  if (snapshot.compareOpen !== undefined) compact.o = snapshot.compareOpen ? 1 : 0;

  const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(compact)), { level: 9 });
  return base64UrlEncode(bytes);
}

/** Inverse of encodeSnapshot. Supports ultra-compact raw-deflate and legacy gzip formats seamlessly. */
export function decodeSnapshot(encoded: string): Snapshot | null {
  try {
    const bytes = base64UrlDecode(encoded);
    let json = "";
    try {
      json = new TextDecoder().decode(inflateSync(bytes));
    } catch {
      json = new TextDecoder().decode(boundedGunzip(bytes));
    }
    return coerceSnapshot(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Generate a 6-character short local alias for quick link sharing within the browser. */
export function generateShortAlias(snapshot: Snapshot): string {
  const fullHash = encodeSnapshot(snapshot);
  const alias = "s_" + Math.random().toString(36).substring(2, 8);
  try {
    localStorage.setItem(`jsonote_alias_${alias}`, fullHash);
  } catch {
    // Ignore quota errors
  }
  return alias;
}

/** Build a share link carrying the whole session, compressed into the URL hash. */
export function buildSnapshotLink(snapshot: Snapshot): string {
  return `${window.location.origin}${window.location.pathname}#s=${encodeSnapshot(snapshot)}`;
}

/**
 * Read a snapshot from a URL hash. Supports compact raw-deflate, short local aliases,
 * and legacy gzip formats.
 */
export function readSnapshotFromHash(hash: string): Snapshot | null {
  const compressed = hash.match(/#s=([A-Za-z0-9_%+=-]+)/);
  if (compressed) {
    const payload = compressed[1];
    if (payload.startsWith("s_")) {
      try {
        const cached = localStorage.getItem(`jsonote_alias_${payload}`);
        if (cached) return decodeSnapshot(cached);
      } catch {
        // ignore
      }
    }
    return decodeSnapshot(payload);
  }

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
