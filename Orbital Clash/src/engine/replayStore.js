// Keeps the most recent battle's replay so the roster can play it back later.
//
// Frames are image Blobs, far too large for localStorage, so they live in
// IndexedDB. The small metadata record is stored under its own key so the
// roster can show/enable its button without loading every frame.

export const REPLAY_SECONDS = 25;

const DB_NAME = "orbital-clash-replay";
const STORE = "replay";
const META_KEY = "meta";
const FRAMES_KEY = "frames";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Replaces the stored replay. Resolves to the saved metadata, or null when there
// was nothing to save or storage is unavailable (a replay is never worth an error).
export async function saveLastReplay(frames, info = {}) {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  const meta = {
    savedAt: Date.now(),
    winner: info.winner ?? null,
    aborted: Boolean(info.aborted),
    fighters: info.fighters ?? [],
    frameCount: frames.length,
    seconds: Math.round(Math.max(0, frames[frames.length - 1].time - frames[0].time))
  };
  try {
    await withStore("readwrite", store => {
      store.put(meta, META_KEY);
      store.put(frames, FRAMES_KEY);
    });
    return meta;
  } catch {
    return null;
  }
}

export async function loadLastReplayMeta() {
  try {
    const meta = await withStore("readonly", store => store.get(META_KEY));
    return meta && typeof meta === "object" ? meta : null;
  } catch {
    return null;
  }
}

export async function loadLastReplayFrames() {
  try {
    const frames = await withStore("readonly", store => store.get(FRAMES_KEY));
    return Array.isArray(frames) ? frames : [];
  } catch {
    return [];
  }
}
