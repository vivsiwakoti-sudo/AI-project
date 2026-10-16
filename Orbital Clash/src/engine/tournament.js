// Tournament mode: bracket management, real-battle resolution and tournament
// statistics. Kept in the engine (not a UI component) so the bracket rules, the
// combat simulation and the save format all live in one place and the UI only
// ever reads/advances state through these functions.
//
// The core rule is that a tournament match is never decided by a coin flip or a
// stat estimate: runTournamentMatch() drives the SAME fighter classes, AI,
// damage, collision, status-effect and death logic the live arena uses, by
// importing those systems from the arena's own engine modules. There is exactly
// one implementation of each class's behaviour, so a tournament fight and a free
// -for-all fight are the same fight.

import { FIGHTER_CLASSES } from "./fighterDefinitions.js";
import { FighterFactory } from "./FighterFactory.js";
import { DamageSystem } from "./systems/DamageSystem.js";
import { CollisionSystem } from "./systems/CollisionSystem.js";
import { ParticleSystem } from "./systems/ParticleSystem.js";
import { spawnPositionFor, launchDirectionFor } from "./systems/SpawnSystem.js";

// --- Tournament shape -------------------------------------------------------
// 25 classes -> 9 preliminary matches (18 fighters) + 7 byes = 16 in the Round
// of 16, then 8 + 4 + 2 + 1 = 24 matches in total. These are the rules, so they
// are constants rather than magic numbers scattered through the code.
export const TOURNAMENT_SIZE = 25;
export const BYE_COUNT = 7;
export const ROUND_DEFINITIONS = [
  { key: "preliminary", label: "Preliminary Round", short: "PRELIM", matches: 9 },
  { key: "round16", label: "Round of 16", short: "R16", matches: 8 },
  { key: "quarterfinal", label: "Quarterfinals", short: "QF", matches: 4 },
  { key: "semifinal", label: "Semifinals", short: "SF", matches: 2 },
  { key: "final", label: "Grand Final", short: "FINAL", matches: 1 }
];
export const TOTAL_MATCHES = ROUND_DEFINITIONS.reduce((sum, round) => sum + round.matches, 0); // 24
export const ROUND_LABELS = Object.fromEntries(ROUND_DEFINITIONS.map(round => [round.key, round.label]));
export const ROUND_ORDER = ROUND_DEFINITIONS.map(round => round.key);

// The arena is always the same size for tournament bouts so a duel plays out on
// the same field a normal battle does (the default 800x800 map).
export const TOURNAMENT_ARENA_SIZE = 800;

// Combat guard rails. The live arena ends a bout when the countdown expires and
// keeps ticking until someone dies; a headless match cannot rely on a timer, so
// it runs on a simulated clock instead. The seconds below are SIMULATION time,
// so at 4x speed a match finishes four times sooner in real time but the
// fighters still get exactly the same amount of combat time.
const MATCH_DT = 1 / 60;               // fixed simulation step
const MATCH_SIM_SECONDS = 300;         // hard ceiling (the arena's 5 minute timer)
const SUDDEN_DEATH_FROM = 300;         // same threshold the arena uses
const SUDDEN_DEATH_DAMAGE = 2;         // same per-second drain the arena uses
const SUDDEN_DEATH_STEP = 1;           // the arena ticks sudden death once a second
const STALE_FRAMES = 60;               // ~1s of live fighter with nothing happening
const MAX_FRAMES = 60000;              // absolute safety valve
const PROGRESS_EPSILON = 0.5;          // HP total must move by this much to count as "live"

// The simulated clock is handed to the fighter classes so a headless match can be
// stepped deterministically. See syncFighterClocks() for why this is needed.
const tournamentClock = { active: false, seconds: 0 };
const realPerformanceNow = typeof performance !== "undefined" ? performance.now.bind(performance) : () => 0;

// While a tournament match is stepping, every fighter reads this clock instead of
// the wall clock. The live arena does not touch the flag at all, so it keeps using
// the real clock exactly as before.
function syncFighterClocks() {
  if (typeof performance === "undefined") return;
  const original = performance.now.bind(performance);
  performance.now = tournamentClock.active
    ? () => tournamentClock.seconds * 1000
    : original;
}

// A fighter's `update()` only ever reads one opponent, exactly like the arena
// hands it. Here the two tournament fighters are each other's opponent.
function buildCombatants(firstName, secondName, arenaSize) {
  const spawnFirst = spawnPositionFor(0, arenaSize);
  const spawnSecond = spawnPositionFor(1, arenaSize);

  const first = FighterFactory.createFighter(firstName, spawnFirst.x, spawnFirst.y);
  const second = FighterFactory.createFighter(secondName, spawnSecond.x, spawnSecond.y);

  const directionFirst = launchDirectionFor(0);
  const directionSecond = launchDirectionFor(1);

  [
    { fighter: first, direction: directionFirst, index: 0 },
    { fighter: second, direction: directionSecond, index: 1 }
  ].forEach(({ fighter, direction, index }) => {
    fighter.vx = direction.vx;
    fighter.vy = direction.vy;
    fighter.teamIndex = index;
    fighter.arenaSize = arenaSize;
    fighter.target = null;
    fighter.opponent = null;
    fighter.eliminatedAt = null;
    fighter.survivalTime = null;
    fighter.placement = null;
  });

  return [first, second];
}

// A fighter has no maximum-time concept of its own, so the headless match runs the
// same clock the arena does: 5 minutes, then a 2-damage-per-second drain on every
// fighter still breathing until someone falls. The drain is applied to BOTH
// fighters at once, so the one who can survive longer wins - the same sudden-death
// rule the live arena plays under. A class may legitimately out-heal it, so the
// drain is only ever the tie-breaker: it cannot produce a winner while an opponent
// still stands.
function liveFighter(fighter) {
  return Boolean(fighter) && !fighter.isDead && fighter.health > 0;
}

function applySuddenDeathDrain(fighters) {
  let landed = false;
  fighters.forEach(fighter => {
    if (!liveFighter(fighter)) return;
    // A null attacker means the drain hurts everyone equally and credits nobody.
    DamageSystem.applyDamage(null, fighter, SUDDEN_DEATH_DAMAGE, "AOE", { ignoreCooldown: true });
    landed = true;
  });
  return landed;
}

function fighterHpTotal(fighters) {
  return fighters.reduce((sum, fighter) => sum + Math.max(0, fighter.health || 0), 0);
}

function combatantSnapshot(fighter) {
  if (!fighter) return null;
  return {
    name: fighter.name,
    color: fighter.color,
    health: Math.max(0, Math.ceil(fighter.health || 0)),
    maxHealth: Math.ceil(fighter.maxHealth || 0),
    damageDealt: Math.floor(fighter.totalDamageDealt || 0),
    damageTaken: Math.floor(fighter.totalDamageTaken || 0),
    kills: Math.max(0, Math.floor(fighter.totalKills || 0)),
    survivalTime: Math.max(0, fighter.survivalTime || 0)
  };
}

// Runs one tournament bout to a genuine conclusion. Returns the winner, or null
// when the match could not produce a valid one (a missing fighter, an instant
// double death). Nothing is invented here: if the simulation cannot decide the
// fight, the caller is told so and can offer a recovery instead.
export function runTournamentMatch(firstName, secondName, options = {}) {
  const { arenaSize = TOURNAMENT_ARENA_SIZE } = options;
  if (!firstName || !secondName) return { winner: null, error: "missing-fighter" };
  if (firstName === secondName) return { winner: null, error: "duplicate-fighter" };

  const particles = new ParticleSystem({ performanceMode: true });
  const fighters = buildCombatants(firstName, secondName, arenaSize);
  fighters.forEach(fighter => { fighter.particleSystem = particles; });

  const previousNow = typeof performance !== "undefined" ? performance.now : null;
  tournamentClock.active = true;
  tournamentClock.seconds = 0;
  syncFighterClocks();

  try {
    let frames = 0;
    let suddenDeathAccumulator = 0;
    let staleFrames = 0;
    let lastHpTotal = fighterHpTotal(fighters);
    let peakLiveFighters = fighters.filter(liveFighter).length;

    while (frames < MAX_FRAMES) {
      frames += 1;
      const elapsed = frames * MATCH_DT;
      tournamentClock.seconds = elapsed;

      // The arena's death sweep runs AFTER all damage for a frame, so several
      // simultaneous blows resolve in one pass and only the last one standing is
      // counted. The same order is kept here.
      fighters.forEach(fighter => {
        const opponent = fighter === fighters[0] ? fighters[1] : fighters[0];
        fighter.opponent = opponent;
        fighter.victims = fighters.filter(other => other !== fighter && !other.isDead && other.health > 0);
        fighter.touchVictims = DamageSystem.isBodyAttacker(fighter)
          ? fighter.victims.filter(other => !other.isInvulnerable)
          : [];
        fighter.update(MATCH_DT, opponent);
      });

      // Sudden death only starts once the normal clock has expired, and only ever
      // affects fighters that are still alive, so a dead fighter cannot be drained.
      if (elapsed >= SUDDEN_DEATH_FROM && fighters.some(liveFighter)) {
        suddenDeathAccumulator += MATCH_DT;
        if (suddenDeathAccumulator >= SUDDEN_DEATH_STEP) {
          suddenDeathAccumulator -= SUDDEN_DEATH_STEP;
          applySuddenDeathDrain(fighters);
        }
      }

      // Resolve deaths (mirrors the arena's two resolveDeaths sweeps, before and
      // after the collision pass).
      fighters.forEach(fighter => {
        if (fighter && !fighter.eliminatedAt && (fighter.isDead || fighter.health <= 0)) {
          fighter.health = Math.min(fighter.health, 0);
          fighter.isDead = true;
          fighter.eliminatedAt = elapsed;
          fighter.survivalTime = elapsed;
        }
      });

      // Physics: walls first, then the fighter-vs-fighter body check. This keeps
      // touch damage, knockback and deflections identical to the live arena.
      const alive = fighters.filter(liveFighter);
      for (let i = 0; i < alive.length; i++) {
        CollisionSystem.resolveFighterWall(alive[i], arenaSize);
      }
      if (alive.length === 2) {
        const [a, b] = alive;
        // Read the contact BEFORE separating the bodies, exactly as the arena does.
        const overlapped = DamageSystem.checkHitbox(a, b, "Overlap");
        const touching = CollisionSystem.resolveFighterFighter(a, b);
        const bodyAttackers = [];
        if ((overlapped || touching) && DamageSystem.isBodyAttacker(a) && a.damageCooldown <= 0) bodyAttackers.push(a);
        if ((overlapped || touching) && DamageSystem.isBodyAttacker(b) && b.damageCooldown <= 0) bodyAttackers.push(b);
        if (bodyAttackers.length > 0) {
          const turn = bodyAttackers[0];
          DamageSystem.applyDamage(turn, turn === a ? b : a, turn.damage, "Body");
        }
      }

      fighters.forEach(fighter => {
        if (fighter && !fighter.eliminatedAt && (fighter.isDead || fighter.health <= 0)) {
          fighter.health = Math.min(fighter.health, 0);
          fighter.isDead = true;
          fighter.eliminatedAt = elapsed;
          fighter.survivalTime = elapsed;
        }
      });

      particles.update(MATCH_DT);

      const liveCount = fighters.filter(liveFighter).length;
      peakLiveFighters = Math.max(peakLiveFighters, liveCount);

      // Someone is still fighting and time remains: keep going. A fighter cannot
      // die and stay alive, so `liveCount === 1` is the normal end of a bout.
      if (liveCount <= 1) break;

      const hpTotal = fighterHpTotal(fighters);
      if (Math.abs(hpTotal - lastHpTotal) > PROGRESS_EPSILON) {
        lastHpTotal = hpTotal;
        staleFrames = 0;
      } else {
        staleFrames += 1;
      }

      // An unbreakable stand-off (two fighters that cannot damage each other) is
      // ended by the same sudden-death drain rather than by picking a winner, so
      // the match still resolves through real combat.
      if (elapsed >= SUDDEN_DEATH_FROM && staleFrames >= STALE_FRAMES) {
        applySuddenDeathDrain(fighters);
        fighters.forEach(fighter => {
          if (fighter && !fighter.eliminatedAt && (fighter.isDead || fighter.health <= 0)) {
            fighter.health = Math.min(fighter.health, 0);
            fighter.isDead = true;
            fighter.eliminatedAt = elapsed;
            fighter.survivalTime = elapsed;
          }
        });
        staleFrames = 0;
        if (fighters.filter(liveFighter).length <= 1) break;
      }
    }

    const survivors = fighters.filter(liveFighter);
    const snapshots = fighters.map(combatantSnapshot);
    const durationSeconds = Math.max(0, tournamentClock.seconds);

    if (survivors.length === 1) {
      const winner = survivors[0];
      const loser = fighters.find(fighter => fighter !== winner);
      return {
        winner: snapshots[fighters.indexOf(winner)],
        loser: snapshots[fighters.indexOf(loser)],
        durationSeconds,
        combatants: snapshots,
        // The raw instances are only useful to a caller that renders the match
        // (the live screen); the bracket only ever needs the snapshots above.
        fighterInstances: fighters,
        peakLiveFighters,
        error: null
      };
    }

    // No single survivor: either both fighters died in the same frame (a genuine
    // draw) or neither could be killed at all. Both are reported as an invalid
    // match so the bracket can surface it instead of inventing a champion.
    if (survivors.length === 0) {
      // A draw still has to eliminate somebody. The fighters' own death timestamps
      // decide who lasted longer, so a "both die in the same frame" tie goes to the
      // fighter whose elimination was resolved first - never to a coin flip.
      const first = fighters[0];
      const second = fighters[1];
      const firstOut = first.survivalTime ?? durationSeconds;
      const secondOut = second.survivalTime ?? durationSeconds;
      if (firstOut !== secondOut) {
        const winner = firstOut > secondOut ? first : second;
        const loser = winner === first ? second : first;
        return {
          winner: snapshots[fighters.indexOf(winner)],
          loser: snapshots[fighters.indexOf(loser)],
          durationSeconds,
          combatants: snapshots,
          fighterInstances: fighters,
          peakLiveFighters,
          error: null
        };
      }
      return { winner: null, loser: null, durationSeconds, combatants: snapshots, fighterInstances: fighters, peakLiveFighters, error: "double-elimination" };
    }

    // Two fighters survived the entire clock without either dying. Nothing can
    // eliminate one without inventing a result, so the match is reported invalid.
    return { winner: null, loser: null, durationSeconds, combatants: snapshots, fighterInstances: fighters, peakLiveFighters, error: "no-decisive-winner" };
  } catch (error) {
    // A class throwing during a headless run must not take the tournament down.
    // `peakLiveFighters` is declared outside the try, but a throw before the first
    // frame would leave it undefined - fall back to the live count so the caller
    // always receives a usable number.
    return { winner: null, loser: null, durationSeconds: 0, combatants: [], fighterInstances: fighters, peakLiveFighters: fighters.filter(liveFighter).length, error: "simulation-error", cause: error };
  } finally {
    tournamentClock.active = false;
    if (previousNow) performance.now = previousNow;
    else syncFighterClocks();
  }
}

// --- Bracket construction ----------------------------------------------------

// Fisher-Yates, driven by an injectable RNG so the automated tests can build the
// same bracket twice and assert its exact shape.
function shuffle(list, random) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Builds a fresh, fully random single-elimination bracket from the existing class
// list. Seven classes are drawn for byes first, then the remaining 18 are paired
// into the 9 preliminary matches. No strength, seed or win rate is consulted -
// byes are random by design.
export function buildTournamentBracket({ random = Math.random, timestamp = Date.now() } = {}) {
  const allNames = Object.keys(FIGHTER_CLASSES);
  if (allNames.length !== TOURNAMENT_SIZE) {
    // The tournament format is defined for 25 classes. A changed roster should be
    // an explicit decision, not a silently malformed bracket.
    throw new Error(`Tournament mode needs ${TOURNAMENT_SIZE} classes, but the roster has ${allNames.length}.`);
  }

  const order = shuffle(allNames, random);
  const byes = order.slice(0, BYE_COUNT);
  const playing = order.slice(BYE_COUNT);

  const preliminaryMatches = [];
  for (let i = 0; i < playing.length; i += 2) {
    preliminaryMatches.push({
      id: `prelim-${preliminaryMatches.length + 1}`,
      round: "preliminary",
      order: preliminaryMatches.length,
      first: playing[i],
      second: playing[i + 1],
      bye: false,
      winner: null,
      loser: null,
      durationSeconds: null,
      status: "pending",
      error: null
    });
  }

  const tournament = {
    id: `tournament-${timestamp}`,
    createdAt: timestamp,
    random: typeof random === "function",
    byes: byes.map((name, index) => ({ name, seed: index })),
    rounds: {
      preliminary: { key: "preliminary", label: ROUND_LABELS.preliminary, matches: preliminaryMatches },
      round16: { key: "round16", label: ROUND_LABELS.round16, matches: [] },
      quarterfinal: { key: "quarterfinal", label: ROUND_LABELS.quarterfinal, matches: [] },
      semifinal: { key: "semifinal", label: ROUND_LABELS.semifinal, matches: [] },
      final: { key: "final", label: ROUND_LABELS.final, matches: [] }
    },
    // Every class in the bracket, in the order it first appears. Filled in as the
    // rounds are created so a restored tournament can list participants without
    // replaying the shuffle.
    participants: order.slice(),
    eliminated: [],
    currentRound: "preliminary",
    currentMatchId: preliminaryMatches[0]?.id ?? null,
    status: "active",
    champion: null,
    runnerUp: null,
    completedAt: null,
    matchResults: [],
    resolvedMatchIds: [],
    error: null
  };

  return tournament;
}

// --- Bracket progression -----------------------------------------------------

// Fills the next round's slots from the winners of the round before it. Called
// after each resolved match, so the bracket is always one step ahead of the
// fighters and never needs a bulk "recompute" pass.
function createRoundMatches(tournament, roundKey, entrants) {
  const round = tournament.rounds[roundKey];
  if (!round) return;
  // Idempotent: a tournament restored mid-round already has its matches, and
  // rebuilding them would wipe recorded results.
  if (round.matches.length > 0) return;
  const definition = ROUND_DEFINITIONS.find(item => item.key === roundKey);
  const expected = definition?.matches ?? Math.floor(entrants.length / 2);
  for (let i = 0; i < expected; i++) {
    round.matches.push({
      id: `${roundKey}-${i + 1}`,
      round: roundKey,
      order: i,
      first: entrants[i * 2] ?? null,
      second: entrants[i * 2 + 1] ?? null,
      bye: false,
      winner: null,
      loser: null,
      durationSeconds: null,
      status: "pending",
      error: null
    });
  }
}

// Returns the ordered list of entrants for a round, or null when the round's
// entrants are not known yet (its feeder round has not finished).
function entrantsForRound(tournament, roundKey) {
  const index = ROUND_ORDER.indexOf(roundKey);
  if (index <= 0) return null;

  const previousKey = ROUND_ORDER[index - 1];
  const previous = tournament.rounds[previousKey];
  if (!previous || previous.matches.length === 0) return null;

  // The preliminary round's winners join the bye classes to form the Round of 16.
  if (roundKey === "round16") {
    const winners = previous.matches.map(match => match.winner).filter(Boolean);
    if (winners.length !== previous.matches.length) return null;
    return [...winners, ...tournament.byes.map(bye => bye.name)];
  }

  const winners = previous.matches.map(match => match.winner).filter(Boolean);
  if (winners.length !== previous.matches.length) return null;
  return winners;
}

// Creates the next round's matches as soon as its entrants exist. The Round of 16
// cannot be built until all 9 preliminary matches are decided, so this is called
// after every resolution rather than on a timer.
function ensureUpcomingRounds(tournament) {
  for (const roundKey of ROUND_ORDER) {
    if (tournament.rounds[roundKey].matches.length > 0) continue;
    const entrants = entrantsForRound(tournament, roundKey);
    if (!entrants) return;
    createRoundMatches(tournament, roundKey, entrants);
    return;
  }
}

// The next undecided match in bracket order. The bracket's own order is the
// tournament order, so "next" is deterministic and cannot skip a round.
export function nextPendingMatch(tournament) {
  if (!tournament || tournament.status === "complete") return null;
  for (const roundKey of ROUND_ORDER) {
    const round = tournament.rounds[roundKey];
    const match = round?.matches.find(item => item.status === "pending" || item.status === "error");
    if (match) return match;
  }
  return null;
}

// Every match in the tournament, in bracket order. Used by the champion screen,
// the bracket view and the validation tests.
export function allMatches(tournament) {
  const matches = [];
  for (const roundKey of ROUND_ORDER) {
    const round = tournament?.rounds?.[roundKey];
    if (round?.matches) matches.push(...round.matches);
  }
  return matches;
}

export function resolvedMatches(tournament) {
  return allMatches(tournament).filter(match => match.status === "resolved");
}

// Where a class finished in the tournament. The champion is 1st, the runner-up
// 2nd, and every other class is ranked by the round it was eliminated in (its
// "best placement" in a single-elimination bracket).
export const PLACEMENT_BY_ROUND = {
  final: 2,
  semifinal: 3,
  quarterfinal: 5,
  round16: 9,
  preliminary: 17
};

function placementFor(tournament, className) {
  if (tournament.champion === className) return 1;
  const loss = allMatches(tournament).find(match => match.loser === className);
  if (!loss) return null;
  if (loss.round === "final") return 2;
  return PLACEMENT_BY_ROUND[loss.round] ?? null;
}

// --- Statistics --------------------------------------------------------------
//
// Tournament statistics live under their own storage key so they can never be
// confused with the regular battle records in `arena-battles-records` or the
// battle log in `arena-battle-history`. Every class gets an explicit zeroed entry
// so "appearances" reads correctly before a class's first tournament fight, and
// the whole structure is sanitised on read so an old or hand-edited save cannot
// crash the UI.

export const TOURNAMENT_STATS_KEY = "orbital-clash-tournament-stats";
export const TOURNAMENT_HISTORY_KEY = "orbital-clash-tournament-history";
export const MAX_TOURNAMENT_HISTORY = 20;

function storageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function emptyClassStats() {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    eliminations: 0,
    championships: 0,
    runnerUps: 0,
    appearances: 0,
    bestPlacement: null,
    totalMatchSeconds: 0,
    totalSurvivalSeconds: 0
  };
}

function sanitizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeClassStats(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const best = sanitizeNumber(source.bestPlacement, null);
  return {
    matches: Math.max(0, Math.floor(sanitizeNumber(source.matches))),
    wins: Math.max(0, Math.floor(sanitizeNumber(source.wins))),
    losses: Math.max(0, Math.floor(sanitizeNumber(source.losses))),
    eliminations: Math.max(0, Math.floor(sanitizeNumber(source.eliminations))),
    championships: Math.max(0, Math.floor(sanitizeNumber(source.championships))),
    runnerUps: Math.max(0, Math.floor(sanitizeNumber(source.runnerUps))),
    appearances: Math.max(0, Math.floor(sanitizeNumber(source.appearances))),
    bestPlacement: best == null ? null : Math.max(1, Math.floor(best)),
    totalMatchSeconds: Math.max(0, sanitizeNumber(source.totalMatchSeconds)),
    totalSurvivalSeconds: Math.max(0, sanitizeNumber(source.totalSurvivalSeconds))
  };
}

// A fresh, fully zeroed statistics document. Every class in the roster gets an
// entry, so a class that has never fought still reports 0 rather than "--".
export function createEmptyTournamentStats(timestamp = null) {
  const classes = {};
  Object.keys(FIGHTER_CLASSES).forEach(name => { classes[name] = emptyClassStats(); });
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    tournamentsCompleted: 0,
    matchesResolved: 0,
    lastChampion: null,
    lastRunnerUp: null,
    classes,
    // head-to-head[classA][classB] = { matches, aWins, bWins }
    headToHead: {}
  };
}

function sanitizeHeadToHead(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  Object.entries(source).forEach(([from, opponents]) => {
    if (!opponents || typeof opponents !== "object") return;
    const row = {};
    Object.entries(opponents).forEach(([to, record]) => {
      if (!record || typeof record !== "object") return;
      row[to] = {
        matches: Math.max(0, Math.floor(sanitizeNumber(record.matches))),
        firstWins: Math.max(0, Math.floor(sanitizeNumber(record.firstWins))),
        secondWins: Math.max(0, Math.floor(sanitizeNumber(record.secondWins)))
      };
    });
    if (Object.keys(row).length > 0) result[from] = row;
  });
  return result;
}

// Fills in anything a previous version of the save is missing (backward
// compatibility) without touching the numbers that are already there.
function sanitizeStatsDocument(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const classes = {};
  Object.keys(FIGHTER_CLASSES).forEach(name => {
    classes[name] = sanitizeClassStats(source.classes?.[name]);
  });
  // A save from a roster with extra classes keeps those rows too, so nothing the
  // player accumulated is dropped just because the class list changed.
  Object.entries(source.classes || {}).forEach(([name, value]) => {
    if (!classes[name]) classes[name] = sanitizeClassStats(value);
  });

  return {
    version: 1,
    createdAt: sanitizeNumber(source.createdAt, null),
    updatedAt: sanitizeNumber(source.updatedAt, null),
    tournamentsCompleted: Math.max(0, Math.floor(sanitizeNumber(source.tournamentsCompleted))),
    matchesResolved: Math.max(0, Math.floor(sanitizeNumber(source.matchesResolved))),
    lastChampion: typeof source.lastChampion === "string" ? source.lastChampion : null,
    lastRunnerUp: typeof source.lastRunnerUp === "string" ? source.lastRunnerUp : null,
    classes,
    headToHead: sanitizeHeadToHead(source.headToHead)
  };
}

export function loadTournamentStats() {
  if (!storageAvailable()) return createEmptyTournamentStats();
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOURNAMENT_STATS_KEY) || "null");
    return sanitizeStatsDocument(raw);
  } catch {
    // A corrupted document is treated as a fresh one rather than thrown, so one
    // bad write cannot lock the player out of tournament mode.
    return createEmptyTournamentStats();
  }
}

export function saveTournamentStats(stats) {
  if (!storageAvailable()) return stats;
  try {
    window.localStorage.setItem(TOURNAMENT_STATS_KEY, JSON.stringify(stats));
  } catch {
    /* storage disabled or full - stats simply will not persist */
  }
  return stats;
}

// --- Completed tournament history -------------------------------------------

function sanitizeTournamentEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const champion = typeof entry.champion === "string" ? entry.champion : null;
  if (!champion) return null;
  const matches = Array.isArray(entry.matches)
    ? entry.matches
      .filter(match => match && typeof match.first === "string" && typeof match.second === "string")
      .map(match => ({
        id: typeof match.id === "string" ? match.id : `${match.first}-${match.second}`,
        round: typeof match.round === "string" ? match.round : "unknown",
        first: match.first,
        second: match.second,
        winner: typeof match.winner === "string" ? match.winner : null,
        loser: typeof match.loser === "string" ? match.loser : null,
        durationSeconds: Math.max(0, sanitizeNumber(match.durationSeconds))
      }))
    : [];
  return {
    id: typeof entry.id === "string" ? entry.id : `tournament-${sanitizeNumber(entry.completedAt)}`,
    createdAt: sanitizeNumber(entry.createdAt, null),
    completedAt: sanitizeNumber(entry.completedAt, null),
    champion,
    championColor: typeof entry.championColor === "string" ? entry.championColor : null,
    runnerUp: typeof entry.runnerUp === "string" ? entry.runnerUp : null,
    runnerUpColor: typeof entry.runnerUpColor === "string" ? entry.runnerUpColor : null,
    finalDurationSeconds: Math.max(0, sanitizeNumber(entry.finalDurationSeconds)),
    byes: Array.isArray(entry.byes) ? entry.byes.filter(name => typeof name === "string") : [],
    path: Array.isArray(entry.path) ? entry.path.filter(step => step && typeof step.opponent === "string") : [],
    matches
  };
}

export function loadTournamentHistory() {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TOURNAMENT_HISTORY_KEY) || "[]");
    return (Array.isArray(parsed) ? parsed : []).map(sanitizeTournamentEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function writeTournamentHistory(entries) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(TOURNAMENT_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    /* storage disabled or full */
  }
}

// --- Applying one resolved match --------------------------------------------

// Records a resolved match in the bracket, the running statistics and the saved
// history. Guarded by `resolvedMatchIds`, so calling it twice for the same match
// id (a double-render, a double-click on Next Match, a replayed effect) can never
// count the same fight twice.
export function applyMatchResult(tournament, match, result) {
  if (!tournament || !match || !result || !result.winner) return { tournament, applied: false };
  if (tournament.resolvedMatchIds.includes(match.id)) return { tournament, applied: false };
  if (match.status === "resolved") return { tournament, applied: false };

  const winnerName = result.winner.name;
  const loserName = result.loser?.name ?? (match.first === winnerName ? match.second : match.first);
  if (!winnerName || !loserName || winnerName === loserName) return { tournament, applied: false };

  const durationSeconds = Math.max(0, result.durationSeconds || 0);

  const next = {
    ...tournament,
    rounds: {
      ...tournament.rounds,
      [match.round]: {
        ...tournament.rounds[match.round],
        matches: tournament.rounds[match.round].matches.map(item => item.id === match.id
          ? { ...item, winner: winnerName, loser: loserName, durationSeconds, status: "resolved", error: null }
          : item)
      }
    },
    eliminated: tournament.eliminated.includes(loserName)
      ? tournament.eliminated
      : [...tournament.eliminated, loserName],
    resolvedMatchIds: [...tournament.resolvedMatchIds, match.id],
    matchResults: [
      ...tournament.matchResults,
      {
        id: match.id,
        round: match.round,
        roundLabel: ROUND_LABELS[match.round] ?? match.round,
        first: match.first,
        second: match.second,
        winner: winnerName,
        loser: loserName,
        durationSeconds,
        combatants: Array.isArray(result.combatants) ? result.combatants : []
      }
    ]
  };

  // A round is complete once every one of its matches is resolved. The next
  // round's slots are then filled from its winners, so the bracket grows as the
  // tournament is played instead of being pre-seeded with placeholders.
  const roundMatches = next.rounds[match.round].matches;
  const roundComplete = roundMatches.length > 0 && roundMatches.every(item => item.status === "resolved");
  if (roundComplete) {
    const roundIndex = ROUND_ORDER.indexOf(match.round);
    const upcoming = ROUND_ORDER[roundIndex + 1];
    if (upcoming) {
      ensureUpcomingRounds(next);
      next.currentRound = upcoming;
    } else {
      next.status = "complete";
      next.completedAt = Date.now();
      next.champion = winnerName;
      next.runnerUp = loserName;
      next.currentRound = "final";
    }
  } else {
    next.currentRound = match.round;
  }

  const pending = nextPendingMatch(next);
  next.currentMatchId = pending ? pending.id : null;
  if (pending) next.currentRound = pending.round;

  return { tournament: next, applied: true };
}

// Folds one resolved tournament into the persistent statistics. Called once, when
// the Grand Final resolves, so a whole tournament's numbers land in a single
// atomic write. `appliedTournamentIds` guards against counting a tournament twice
// if the champion screen mounts again after a reload.
export function recordTournamentResult(tournament, { timestamp = Date.now() } = {}) {
  const stats = loadTournamentStats();
  const alreadyRecorded = stats.headToHead?.__tournaments?.[tournament?.id];
  if (!tournament || tournament.status !== "complete" || !tournament.champion) return stats;
  if (alreadyRecorded) return stats;

  const next = sanitizeStatsDocument(stats);
  next.classes = { ...next.classes };
  next.headToHead = { ...next.headToHead };

  const touch = name => {
    if (!next.classes[name]) next.classes[name] = emptyClassStats();
    return { ...next.classes[name] };
  };
  const write = (name, patch) => { next.classes[name] = patch; };

  // Everyone who took part gets an appearance; everyone who lost gets a loss and
  // an elimination. Only the champion is spared a loss (they never lost a match).
  const participants = new Set([...(tournament.participants || []), ...tournament.byes.map(bye => bye.name)]);
  participants.forEach(name => {
    const current = touch(name);
    const placement = placementFor(tournament, name);
    const isChampion = name === tournament.champion;
    const best = current.bestPlacement == null || (placement != null && placement < current.bestPlacement)
      ? placement
      : current.bestPlacement;
    write(name, {
      ...current,
      appearances: current.appearances + 1,
      championships: current.championships + (isChampion ? 1 : 0),
      runnerUps: current.runnerUps + (name === tournament.runnerUp ? 1 : 0),
      bestPlacement: best
    });
  });

  tournament.matchResults.forEach(matchResult => {
    const winner = touch(matchResult.winner);
    const loser = touch(matchResult.loser);
    write(matchResult.winner, {
      ...winner,
      matches: winner.matches + 1,
      wins: winner.wins + 1,
      totalMatchSeconds: winner.totalMatchSeconds + matchResult.durationSeconds
    });
    write(matchResult.loser, {
      ...loser,
      matches: loser.matches + 1,
      losses: loser.losses + 1,
      eliminations: loser.eliminations + 1,
      totalMatchSeconds: loser.totalMatchSeconds + matchResult.durationSeconds,
      totalSurvivalSeconds: loser.totalSurvivalSeconds + matchResult.durationSeconds
    });

    // Head-to-head: the winner's row gains a win over the loser, and vice versa,
    // so "A vs B" can be read from either side.
    const rowFor = (from, to, key) => {
      const row = { ...(next.headToHead[from] || {}) };
      const record = row[to] || { matches: 0, firstWins: 0, secondWins: 0 };
      row[to] = { ...record, matches: record.matches + 1, [key]: record[key] + 1 };
      next.headToHead[from] = row;
    };
    rowFor(matchResult.winner, matchResult.loser, "firstWins");
    rowFor(matchResult.loser, matchResult.winner, "secondWins");
  });

  next.tournamentsCompleted = next.tournamentsCompleted + 1;
  next.matchesResolved = next.matchesResolved + tournament.matchResults.length;
  next.lastChampion = tournament.champion;
  next.lastRunnerUp = tournament.runnerUp;
  next.updatedAt = timestamp;

  // A tiny marker row keeps the guard cheap without a second storage key.
  next.headToHead.__tournaments = { ...(next.headToHead.__tournaments || {}), [tournament.id]: true };

  saveTournamentStats(next);

  // The completed tournament is also appended to its own history log so the
  // champion screen's data survives a reload even if the player never opens the
  // stats panel.
  const history = loadTournamentHistory();
  const entry = {
    id: tournament.id,
    createdAt: tournament.createdAt,
    completedAt: tournament.completedAt ?? timestamp,
    champion: tournament.champion,
    championColor: FIGHTER_CLASSES[tournament.champion]?.color ?? null,
    runnerUp: tournament.runnerUp,
    runnerUpColor: FIGHTER_CLASSES[tournament.runnerUp]?.color ?? null,
    finalDurationSeconds: tournament.matchResults.find(item => item.round === "final")?.durationSeconds ?? 0,
    byes: tournament.byes.map(bye => bye.name),
    path: championPath(tournament).map(step => ({ ...step })),
    matches: tournament.matchResults.map(item => ({
      id: item.id,
      round: item.round,
      first: item.first,
      second: item.second,
      winner: item.winner,
      loser: item.loser,
      durationSeconds: item.durationSeconds
    }))
  };
  const alreadyInHistory = history.some(item => item.id === entry.id);
  if (!alreadyInHistory) {
    writeTournamentHistory([entry, ...history].slice(0, MAX_TOURNAMENT_HISTORY));
  }

  return next;
}

// The champion's matches, in bracket order. Empty until the tournament is over,
// because "the path" only has meaning once every round has been played.
export function championPath(tournament) {
  if (!tournament || !tournament.champion) return [];
  return allMatches(tournament)
    .filter(match => match.status === "resolved" && (match.first === tournament.champion || match.second === tournament.champion))
    .map(match => ({
      id: match.id,
      round: match.round,
      roundLabel: ROUND_LABELS[match.round] ?? match.round,
      opponent: match.first === tournament.champion ? match.second : match.first,
      won: match.winner === tournament.champion,
      durationSeconds: match.durationSeconds
    }));
}

// --- Save/restore of an in-progress tournament -------------------------------

export const TOURNAMENT_SAVE_KEY = "orbital-clash-tournament-active";

export function saveActiveTournament(tournament) {
  if (!storageAvailable()) return tournament;
  try {
    if (!tournament) window.localStorage.removeItem(TOURNAMENT_SAVE_KEY);
    else window.localStorage.setItem(TOURNAMENT_SAVE_KEY, JSON.stringify(tournament));
  } catch {
    /* storage disabled or full */
  }
  return tournament;
}

function sanitizeMatch(raw, roundKey, index) {
  if (!raw || typeof raw !== "object") return null;
  const first = typeof raw.first === "string" ? raw.first : null;
  const second = typeof raw.second === "string" ? raw.second : null;
  if (!first || !second) return null;
  const winner = typeof raw.winner === "string" && (raw.winner === first || raw.winner === second) ? raw.winner : null;
  const loser = winner ? (winner === first ? second : first) : null;
  return {
    id: typeof raw.id === "string" ? raw.id : `${roundKey}-${index + 1}`,
    round: roundKey,
    order: index,
    first,
    second,
    bye: false,
    winner,
    loser,
    durationSeconds: Number.isFinite(raw.durationSeconds) ? Math.max(0, raw.durationSeconds) : null,
    status: winner ? "resolved" : "pending",
    error: null
  };
}

// Restores an in-progress tournament. Anything malformed is dropped rather than
// trusted, so a stale or hand-edited save cannot corrupt a new bracket. A
// tournament with an invalid shape is discarded (returns null) and the UI starts
// a fresh one instead of showing a broken bracket.
export function loadActiveTournament() {
  if (!storageAvailable()) return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOURNAMENT_SAVE_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    const rounds = {};
    for (const roundKey of ROUND_ORDER) {
      const stored = raw.rounds?.[roundKey]?.matches;
      rounds[roundKey] = {
        key: roundKey,
        label: ROUND_LABELS[roundKey],
        matches: (Array.isArray(stored) ? stored : []).map((match, index) => sanitizeMatch(match, roundKey, index)).filter(Boolean)
      };
    }

    const all = ROUND_ORDER.flatMap(key => rounds[key].matches);
    if (all.length === 0) return null;
    const resolvedMatchIds = all.filter(match => match.status === "resolved").map(match => match.id);

    const participants = Array.isArray(raw.participants) && raw.participants.length === TOURNAMENT_SIZE
      ? raw.participants.filter(name => typeof name === "string")
      : null;
    if (!participants) return null;

    const byes = Array.isArray(raw.byes)
      ? raw.byes.map(bye => (typeof bye === "string" ? { name: bye, seed: 0 } : { name: bye?.name, seed: sanitizeNumber(bye?.seed) }))
        .filter(bye => typeof bye.name === "string")
      : [];
    if (byes.length !== BYE_COUNT) return null;

    const tournament = {
      id: typeof raw.id === "string" ? raw.id : `tournament-${Date.now()}`,
      createdAt: sanitizeNumber(raw.createdAt, Date.now()),
      byes,
      rounds,
      participants,
      eliminated: Array.isArray(raw.eliminated) ? raw.eliminated.filter(name => typeof name === "string") : [],
      currentRound: ROUND_ORDER.includes(raw.currentRound) ? raw.currentRound : "preliminary",
      currentMatchId: typeof raw.currentMatchId === "string" ? raw.currentMatchId : null,
      status: raw.status === "complete" ? "complete" : "active",
      champion: typeof raw.champion === "string" ? raw.champion : null,
      runnerUp: typeof raw.runnerUp === "string" ? raw.runnerUp : null,
      completedAt: Number.isFinite(raw.completedAt) ? raw.completedAt : null,
      matchResults: Array.isArray(raw.matchResults) ? raw.matchResults : [],
      resolvedMatchIds,
      error: null
    };

    // A complete tournament restored from a save is returned as-is; the UI shows
    // the champion screen for it rather than replaying the bracket.
    if (tournament.status === "complete") return tournament;

    const pending = nextPendingMatch(tournament);
    if (!pending) {
      // Every recorded match is resolved but the final was never closed out (the
      // game was closed mid-celebration). Promote it so the save is usable.
      const final = tournament.rounds.final.matches[0];
      if (final?.winner) {
        tournament.status = "complete";
        tournament.champion = final.winner;
        tournament.runnerUp = final.loser;
        tournament.completedAt = tournament.completedAt ?? Date.now();
        return tournament;
      }
      return null;
    }
    tournament.currentMatchId = pending.id;
    tournament.currentRound = pending.round;
    return tournament;
  } catch {
    return null;
  }
}

// --- Validation --------------------------------------------------------------

// Structural checks used both by the automated tests and by the UI before a
// tournament is handed to the spectator screen. Every failure is reported as a
// readable string so the screen can show what is wrong instead of failing
// silently.
export function validateTournament(tournament, { requireComplete = false } = {}) {
  const problems = [];
  if (!tournament || typeof tournament !== "object") return ["Tournament data is missing."];

  const matches = allMatches(tournament);
  if (matches.length === 0) problems.push("The bracket has no matches.");

  const ids = new Set();
  matches.forEach(match => {
    if (ids.has(match.id)) problems.push(`Duplicate match id "${match.id}".`);
    ids.add(match.id);
    if (!match.first || !match.second) problems.push(`Match "${match.id}" is missing a fighter.`);
    if (match.first === match.second) problems.push(`Match "${match.id}" pairs a fighter with itself.`);
    if (match.status === "resolved" && (!match.winner || !match.loser)) problems.push(`Match "${match.id}" is resolved without a winner and loser.`);
  });

  for (const roundKey of ROUND_ORDER) {
    const definition = ROUND_DEFINITIONS.find(item => item.key === roundKey);
    const round = tournament.rounds[roundKey];
    if (!round) {
      problems.push(`Round "${roundKey}" is missing.`);
      continue;
    }
    if (round.matches.length > definition.matches) {
      problems.push(`Round "${roundKey}" has ${round.matches.length} matches, expected ${definition.matches}.`);
    }
  }

  if (tournament.byes.length !== BYE_COUNT) {
    problems.push(`The bracket has ${tournament.byes.length} byes, expected ${BYE_COUNT}.`);
  }

  // Every class must appear exactly once in the bracket's first slots: either in
  // a preliminary match or in the bye list.
  const entrants = [
    ...tournament.rounds.preliminary.matches.flatMap(match => [match.first, match.second]),
    ...tournament.byes.map(bye => bye.name)
  ].filter(Boolean);
  const uniqueEntrants = new Set(entrants);
  if (entrants.length !== TOURNAMENT_SIZE || uniqueEntrants.size !== TOURNAMENT_SIZE) {
    problems.push(`The bracket has ${uniqueEntrants.size} unique entrants, expected ${TOURNAMENT_SIZE}.`);
  }

  if (requireComplete) {
    if (tournament.status !== "complete") problems.push("The tournament is not complete.");
    if (!tournament.champion) problems.push("The tournament has no champion.");
    if (resolvedMatches(tournament).length !== TOTAL_MATCHES) {
      problems.push(`The tournament resolved ${resolvedMatches(tournament).length} matches, expected ${TOTAL_MATCHES}.`);
    }
    // No eliminated class may appear in an unresolved match.
    const eliminated = new Set(tournament.eliminated);
    matches.forEach(match => {
      if (match.status !== "resolved") return;
      if (eliminated.has(match.winner)) problems.push(`Eliminated class "${match.winner}" won match "${match.id}".`);
    });
    const champions = new Set(matches.filter(match => match.round === "final" && match.winner).map(match => match.winner));
    if (champions.size > 1) problems.push("More than one champion was declared.");
  }

  return problems;
}

// How many matches of each round still have to be played. Used by the UI header.
export function tournamentProgress(tournament) {
  const matches = allMatches(tournament);
  const resolved = matches.filter(match => match.status === "resolved").length;
  return { resolved, total: TOTAL_MATCHES, remaining: TOTAL_MATCHES - resolved };
}

export const TOURNAMENT_INTERNALS = {
  MATCH_DT,
  MATCH_SIM_SECONDS,
  SUDDEN_DEATH_FROM,
  buildCombatants,
  shuffle,
  liveFighter
};

// Kept for callers that want the raw wall clock the engine captured at import time
// (used by the tests to prove the clock is restored after a headless match).
export const REAL_NOW = realPerformanceNow;
