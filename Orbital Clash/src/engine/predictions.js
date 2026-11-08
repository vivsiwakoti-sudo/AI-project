// Persistent winner predictions.
//
// Before a roster battle or a new tournament the player names up to four
// guessers (G1..G4) and each one picks a winner. Each pick is stored here and
// marked right or wrong once the outcome is known, so the menu can show a
// running tally. Like the battle history, storage is best-effort: a disabled or
// full localStorage must never block a battle.

export const PREDICTIONS_KEY = "arena-predictions";

export const MAX_GUESSERS = 4;

export const PREDICTION_KINDS = { battle: "battle", tournament: "tournament" };

// Newest entries are kept at the FRONT of the array, the same as battle history.
export const MAX_PREDICTION_ENTRIES = 200;

function available() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeGuess(guess, index) {
  if (!guess || typeof guess !== "object" || typeof guess.pick !== "string") return null;
  return {
    guesser: typeof guess.guesser === "string" ? guess.guesser : `G${index + 1}`,
    pick: guess.pick,
    // null until the outcome is known, then true (right) or false (wrong).
    correct: typeof guess.correct === "boolean" ? guess.correct : null
  };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const guesses = Array.isArray(entry.guesses)
    ? entry.guesses.map(normalizeGuess).filter(Boolean).slice(0, MAX_GUESSERS)
    : [];
  if (guesses.length === 0) return null;
  const status = ["pending", "resolved", "void"].includes(entry.status) ? entry.status : "pending";
  return {
    id: typeof entry.id === "string" ? entry.id : String(entry.createdAt ?? Date.now()),
    kind: entry.kind === PREDICTION_KINDS.tournament ? PREDICTION_KINDS.tournament : PREDICTION_KINDS.battle,
    tournamentId: typeof entry.tournamentId === "string" ? entry.tournamentId : null,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : null,
    status,
    winner: typeof entry.winner === "string" ? entry.winner : null,
    guesses
  };
}

export function loadPredictions() {
  if (!available()) return [];
  try {
    return safeParse(window.localStorage.getItem(PREDICTIONS_KEY))
      .map(normalizeEntry)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writePredictions(entries) {
  if (!available()) return;
  try {
    window.localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(entries));
  } catch {
    /* storage disabled or full - predictions just will not persist */
  }
}

// Only one battle and one tournament can be awaiting an outcome at a time, so a
// new prediction of a kind voids any older still-pending one of that kind. That
// covers a battle or tournament that was started without finishing.
export function addPrediction({ kind, tournamentId = null, guesses }) {
  const picks = (Array.isArray(guesses) ? guesses : [])
    .filter(pick => typeof pick === "string" && pick.length > 0)
    .slice(0, MAX_GUESSERS)
    .map((pick, index) => ({ guesser: `G${index + 1}`, pick, correct: null }));
  if (picks.length === 0) return loadPredictions();

  const resolvedKind = kind === PREDICTION_KINDS.tournament ? PREDICTION_KINDS.tournament : PREDICTION_KINDS.battle;
  const now = Date.now();
  const entry = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: resolvedKind,
    tournamentId: resolvedKind === PREDICTION_KINDS.tournament ? tournamentId : null,
    createdAt: now,
    status: "pending",
    winner: null,
    guesses: picks
  };

  const superseded = loadPredictions().map(existing =>
    existing.kind === resolvedKind && existing.status === "pending"
      ? { ...existing, status: "void" }
      : existing
  );
  const next = [entry, ...superseded].slice(0, MAX_PREDICTION_ENTRIES);
  writePredictions(next);
  return next;
}

// Marks every pick on a pending entry as right or wrong against `winner`.
// `winner` null (an aborted battle, or no champion) voids the entry instead.
function settle(entry, winner) {
  if (!winner) return { ...entry, status: "void" };
  return {
    ...entry,
    status: "resolved",
    winner,
    guesses: entry.guesses.map(guess => ({ ...guess, correct: guess.pick === winner }))
  };
}

function resolvePending(predicate, winner) {
  const list = loadPredictions();
  const index = list.findIndex(entry => entry.status === "pending" && predicate(entry));
  if (index === -1) return list;
  const next = list.slice();
  next[index] = settle(list[index], winner);
  writePredictions(next);
  return next;
}

export function resolveBattlePrediction({ winner, aborted = false }) {
  return resolvePending(
    entry => entry.kind === PREDICTION_KINDS.battle,
    aborted ? null : winner ?? null
  );
}

export function resolveTournamentPrediction(tournamentId, champion) {
  if (!tournamentId) return loadPredictions();
  return resolvePending(
    entry => entry.kind === PREDICTION_KINDS.tournament && entry.tournamentId === tournamentId,
    champion ?? null
  );
}

export function voidTournamentPrediction(tournamentId) {
  if (!tournamentId) return loadPredictions();
  const list = loadPredictions();
  const next = list.map(entry =>
    entry.kind === PREDICTION_KINDS.tournament && entry.tournamentId === tournamentId && entry.status === "pending"
      ? { ...entry, status: "void" }
      : entry
  );
  writePredictions(next);
  return next;
}

// Tallies only resolved entries: a pending or voided prediction has no right or
// wrong answer yet, so it must not count toward either side.
export function tallyPredictions(list) {
  const overall = { correct: 0, total: 0 };
  const guessers = Array.from({ length: MAX_GUESSERS }, (_, i) => ({
    guesser: `G${i + 1}`,
    correct: 0,
    total: 0
  }));
  (Array.isArray(list) ? list : []).forEach(entry => {
    if (entry.status !== "resolved") return;
    entry.guesses.forEach((guess, index) => {
      if (typeof guess.correct !== "boolean") return;
      overall.total += 1;
      if (guess.correct) overall.correct += 1;
      const slot = guessers[index];
      if (!slot) return;
      slot.total += 1;
      if (guess.correct) slot.correct += 1;
    });
  });
  return { overall, guessers: guessers.filter(slot => slot.total > 0) };
}

export function clearPredictions() {
  if (!available()) return [];
  try {
    window.localStorage.removeItem(PREDICTIONS_KEY);
  } catch {
    /* storage disabled - nothing to clear */
  }
  return [];
}
