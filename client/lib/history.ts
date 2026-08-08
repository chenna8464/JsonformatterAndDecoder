import { openDB, type IDBPDatabase } from "idb";

// Local, per-document version history ("time travel"). Every meaningful change
// is snapshotted into IndexedDB so a developer can scrub back through how a
// document evolved and diff any past version against the current one. Entirely
// on-device — nothing is uploaded.

export type Version = {
  id?: number;
  docKey: string;
  name: string;
  content: string;
  savedAt: number;
  size: number;
};

const DB_NAME = "jsonote";
const STORE = "versions";
const MAX_PER_DOC = 60;

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("docKey", "docKey");
        store.createIndex("docKey_savedAt", ["docKey", "savedAt"]);
      },
    });
  }
  return dbPromise;
};

/**
 * Pure decision: should we snapshot this content? Skip if it's empty or
 * identical to the most recent stored version (avoids duplicate noise).
 */
export function shouldSaveVersion(content: string, latest: Version | undefined): boolean {
  if (!content.trim()) return false;
  if (latest && latest.content === content) return false;
  return true;
}

/** Pure: keep only the newest `max` versions, returning ids to delete. */
export function versionsToPrune(versions: Version[], max = MAX_PER_DOC): number[] {
  if (versions.length <= max) return [];
  return versions
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(max)
    .map((v) => v.id as number)
    .filter((id) => id !== undefined);
}

/** All versions for a document, newest first. */
export async function listVersions(docKey: string): Promise<Version[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(STORE, "docKey", docKey)) as Version[];
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Save a version if it's meaningfully new. Returns the created version, or null
 * if it was skipped as a duplicate. `now` is injectable for testing.
 */
export async function saveVersion(docKey: string, name: string, content: string, now = Date.now()): Promise<Version | null> {
  const existing = await listVersions(docKey);
  if (!shouldSaveVersion(content, existing[0])) return null;

  const db = await getDb();
  const version: Version = { docKey, name, content, savedAt: now, size: new Blob([content]).size };
  const id = (await db.add(STORE, version)) as number;
  version.id = id;

  const prune = versionsToPrune([version, ...existing]);
  if (prune.length) {
    const tx = db.transaction(STORE, "readwrite");
    await Promise.all([...prune.map((pid) => tx.store.delete(pid)), tx.done]);
  }
  return version;
}

export async function getVersion(id: number): Promise<Version | undefined> {
  const db = await getDb();
  return (await db.get(STORE, id)) as Version | undefined;
}

export async function clearHistory(docKey: string): Promise<void> {
  const db = await getDb();
  const versions = await listVersions(docKey);
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all([...versions.map((v) => tx.store.delete(v.id as number)), tx.done]);
}
