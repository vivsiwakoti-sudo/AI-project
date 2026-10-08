// Persistent battle history.
//
// Every completed battle is appended here as one compact entry, so the roster
// can show a chronological log of past fights ("who fought, who won, when")
// even though the per-class records in `arena-battles-records` only keep
// aggregate totals. Kept in the engine (not a component) so the writing side
// (the end screen) and the reading side (the menu) share one key, one entry
// shape and one cap without either importing the other.
//
// Storage is best-effort: a disabled or full localStorage (private mode, a
// quota error) must never break a battle, so every access is guarded and a
// failure simply means the history does not persist.

export const HISTORY_KEY = "arena-battle-history";

// Newest entries are kept at the FRONT of the array. The cap bounds how much
// storage a long-running install can consume; a battle log is a short recap,
// not an archive, so the oldest entries fall off once the cap is reached.
export const MAX_HISTORY_ENTRIES = 25;

function available() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupted or hand-edited entry must not take the whole log down; an
    // unreadable history is treated as empty rather than thrown.
    return [];
  }
}

// Normalizes one stored entry so a hand-edited or older record cannot crash the
// renderer. Only the fields the UI reads are trusted; everything else is
// rebuilt with sane defaults.
function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const participants = Array.isArray(entry.participants)
    ? entry.participants
      .filter(p => p && typeof p.name === "string")
      .map(p => ({
        name: p.name,
        color: typeof p.color === "string" ? p.color : "#00f2ff",
        placement: Number.isFinite(p.placement) ? p.placement : null,
        kills: Number.isFinite(p.kills) ? Math.max(0, Math.floor(p.kills)) : 0
      }))
    : [];
  if (participants.length === 0) return null;
  return {
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : null,
    winner: typeof entry.winner === "string" ? entry.winner : null,
    // An aborted battle is recorded as a no-contest so the log is a faithful
    // history of every battle that was played, not only the decisive ones.
    aborted: Boolean(entry.aborted),
    durationSeconds: Number.isFinite(entry.durationSeconds) ? Math.max(0, entry.durationSeconds) : 0,
    participants
  };
}

export function loadHistory() {
  if (!available()) return [];
  try {
    return safeParse(window.localStorage.getItem(HISTORY_KEY))
      .map(normalizeEntry)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  if (!available()) return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* storage disabled or full - history just will not persist */
  }
}

// Builds a history entry from an end-of-battle results array and appends it.
// Returns the new (newest-first) history so the caller can render it without a
// second read. `results` is the same array the end screen receives: each fighter
// carries name/color/placement and the battle-wide duration.
export function recordBattle(results, { aborted = false } = {}) {
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) return loadHistory();

  const participants = list.map(f => ({
    name: f?.name ?? "Unknown",
    color: typeof f?.color === "string" ? f.color : "#00f2ff",
    placement: Number.isFinite(f?.placement) ? f.placement : null,
    kills: Math.max(0, Math.floor(f?.totalKills || 0))
  }));

  const winner = aborted
    ? null
    : participants.find(p => p.placement === 1)?.name
    ?? participants[0]?.name
    ?? null;

  const durationSeconds = Math.max(
    0,
    Math.round(list.reduce((longest, f) => Math.max(longest, f?.battleDuration ?? 0), 0))
  );

  const entry = { timestamp: Date.now(), winner, aborted, durationSeconds, participants };
  const next = [entry, ...loadHistory()].slice(0, MAX_HISTORY_ENTRIES);
  writeHistory(next);
  return next;
}

export function clearHistory() {
  if (!available()) return [];
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* storage disabled - nothing to clear */
  }
  return [];
}
