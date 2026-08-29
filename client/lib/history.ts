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

/*
 * Deliberately still "jsonote", from before the app was renamed to JSONField.
 *
 * An IndexedDB database name is an address, not a label. Nobody ever sees this
 * string, but changing it points the app at a brand-new empty database and
 * orphans the old one — every existing user would silently lose their whole
 * version history (up to 30 days of documents) on the deploy that renamed it,
 * with no error and nothing to restore from.
 *
 * That trade is only worth making for a cosmetic win if you also ship a
 * migration that copies the old store across, and there is no reason to write
 * one for a name no user reads. Renaming it is a data-loss bug wearing a
 * rebrand's clothing.
 */
const DB_NAME = "jsonote";
const STORE = "versions";
export const MAX_PER_DOC = 30; // 30 snapshots sweet spot
export const RETENTION_DAYS = 30; // 30 days (1 month) retention window sweet spot
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
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
export function shouldSaveVersion(
  content: string,
  latest: Version | undefined,
): boolean {
  if (!content.trim()) return false;
  if (latest && latest.content === content) return false;
  return true;
}

/**
 * Pure: keep versions from the last 30 days (up to `max` snapshots),
 * returning the IDs of versions that should be pruned.
 */
export function versionsToPrune(
  versions: Version[],
  max = MAX_PER_DOC,
  maxAgeMs = RETENTION_MS,
  now = Date.now(),
): number[] {
  if (versions.length <= 1) return [];

  const sorted = versions.slice().sort((a, b) => b.savedAt - a.savedAt);
  const toDelete = new Set<number>();

  // 1. Prune versions beyond max snapshot limit
  if (sorted.length > max) {
    for (let i = max; i < sorted.length; i++) {
      if (sorted[i].id !== undefined) {
        toDelete.add(sorted[i].id as number);
      }
    }
  }

  // 2. Prune versions older than 30 days (1 month sweet spot)
  for (let i = 0; i < sorted.length; i++) {
    const age = now - sorted[i].savedAt;
    if (age > maxAgeMs) {
      if (sorted[i].id !== undefined) {
        toDelete.add(sorted[i].id as number);
      }
    }
  }

  return Array.from(toDelete);
}

/** All versions for a document, newest first. Automatically prunes expired ones. */
export async function listVersions(
  docKey: string,
  now = Date.now(),
): Promise<Version[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(STORE, "docKey", docKey)) as Version[];
  const sorted = all.sort((a, b) => b.savedAt - a.savedAt);

  // Auto-prune versions older than 30 days or beyond MAX_PER_DOC
  const pruneIds = versionsToPrune(sorted, MAX_PER_DOC, RETENTION_MS, now);
  if (pruneIds.length) {
    const tx = db.transaction(STORE, "readwrite");
    await Promise.all([
      ...pruneIds.map((pid) => tx.store.delete(pid)),
      tx.done,
    ]);
    return sorted.filter((v) => v.id !== undefined && !pruneIds.includes(v.id));
  }

  return sorted;
}

/**
 * Save a version if it's meaningfully new. Returns the created version, or null
 * if it was skipped as a duplicate. `now` is injectable for testing.
 */
export async function saveVersion(
  docKey: string,
  name: string,
  content: string,
  now = Date.now(),
): Promise<Version | null> {
  const existing = await listVersions(docKey, now);
  if (!shouldSaveVersion(content, existing[0])) return null;

  const db = await getDb();
  const version: Version = {
    docKey,
    name,
    content,
    savedAt: now,
    size: new Blob([content]).size,
  };
  const id = (await db.add(STORE, version)) as number;
  version.id = id;

  const prune = versionsToPrune(
    [version, ...existing],
    MAX_PER_DOC,
    RETENTION_MS,
    now,
  );
  if (prune.length) {
    const tx = db.transaction(STORE, "readwrite");
    await Promise.all([...prune.map((pid) => tx.store.delete(pid)), tx.done]);
  }
  return version;
}

export async function pruneExpiredVersions(
  docKey: string,
  now = Date.now(),
): Promise<number> {
  const existing = await listVersions(docKey, now);
  const pruneIds = versionsToPrune(existing, MAX_PER_DOC, RETENTION_MS, now);
  if (pruneIds.length) {
    const db = await getDb();
    const tx = db.transaction(STORE, "readwrite");
    await Promise.all([
      ...pruneIds.map((pid) => tx.store.delete(pid)),
      tx.done,
    ]);
  }
  return pruneIds.length;
}

export async function getVersion(id: number): Promise<Version | undefined> {
  const db = await getDb();
  return (await db.get(STORE, id)) as Version | undefined;
}

export async function deleteVersion(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function clearHistory(docKey: string): Promise<void> {
  const db = await getDb();
  const versions = await listVersions(docKey);
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all([
    ...versions.map((v) => tx.store.delete(v.id as number)),
    tx.done,
  ]);
}
