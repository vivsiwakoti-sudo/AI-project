// Keeps the most recent battle's replay so the roster can play it back later.
//
// Frames are image Blobs, far too large for localStorage, so they live in
// IndexedDB. The small metadata record is stored under its own key so the
// roster can show/enable its button without loading every frame.

export const REPLAY_SECONDS = 25;

// Favorites are clips the player chose to keep. They are copies of the last
// replay, so the next battle overwriting the "last replay" never touches them.
// Metadata and frames live in separate stores so the favorites list can be shown
// without loading every clip's frames.
export const MAX_FAVORITE_REPLAYS = 20;

const DB_NAME = "orbital-clash-replay";
const STORE = "replay";
const FAVORITE_META_STORE = "favorite-meta";
const FAVORITE_FRAMES_STORE = "favorite-frames";
const META_KEY = "meta";
const FRAMES_KEY = "frames";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      [STORE, FAVORITE_META_STORE, FAVORITE_FRAMES_STORE].forEach(name => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// `run` receives a getter for the named stores and may return a request, or an
// array of requests, whose results are resolved once the transaction completes.
async function withStores(names, mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      const result = run(name => tx.objectStore(name));
      const settle = value => (typeof IDBRequest !== "undefined" && value instanceof IDBRequest ? value.result : value);
      tx.oncomplete = () => resolve(Array.isArray(result) ? result.map(settle) : settle(result));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function withStore(mode, run) {
  return withStores([STORE], mode, get => run(get(STORE)));
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

// --- Favorites ---------------------------------------------------------------

// Newest first. Each entry is the clip's metadata plus its `id`.
export async function listFavoriteReplays() {
  try {
    const metas = await withStores([FAVORITE_META_STORE], "readonly", get => get(FAVORITE_META_STORE).getAll());
    return (Array.isArray(metas) ? metas : [])
      .filter(meta => meta && typeof meta.id === "string")
      .sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));
  } catch {
    return [];
  }
}

// Copies the current last replay into the favorites. Resolves to
// { meta } on success (or when this replay is already a favorite), or
// { error: "none" | "full" | "failed" } so the UI can say why nothing was saved.
export async function favoriteLastReplay() {
  try {
    const [lastMeta, frames] = await withStores([STORE], "readonly", get => [get(STORE).get(META_KEY), get(STORE).get(FRAMES_KEY)]);
    if (!lastMeta || !Array.isArray(frames) || frames.length === 0) return { error: "none" };

    const existing = await listFavoriteReplays();
    const duplicate = existing.find(meta => meta.sourceSavedAt === lastMeta.savedAt);
    if (duplicate) return { meta: duplicate };
    if (existing.length >= MAX_FAVORITE_REPLAYS) return { error: "full" };

    const meta = {
      ...lastMeta,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceSavedAt: lastMeta.savedAt,
      favoritedAt: Date.now()
    };
    await withStores([FAVORITE_META_STORE, FAVORITE_FRAMES_STORE], "readwrite", get => {
      get(FAVORITE_META_STORE).put(meta, meta.id);
      get(FAVORITE_FRAMES_STORE).put(frames, meta.id);
    });
    return { meta };
  } catch {
    return { error: "failed" };
  }
}

export async function removeFavoriteReplay(id) {
  try {
    await withStores([FAVORITE_META_STORE, FAVORITE_FRAMES_STORE], "readwrite", get => {
      get(FAVORITE_META_STORE).delete(id);
      get(FAVORITE_FRAMES_STORE).delete(id);
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadFavoriteReplayFrames(id) {
  try {
    const frames = await withStores([FAVORITE_FRAMES_STORE], "readonly", get => get(FAVORITE_FRAMES_STORE).get(id));
    return Array.isArray(frames) ? frames : [];
  } catch {
    return [];
  }
}
