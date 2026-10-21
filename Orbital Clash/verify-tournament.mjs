// Independent verification of the 25-class / 24-match tournament format and the
// "save an unfinished tournament" requirement. Runs against the real engine.
const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); }
  },
  AudioContext: function () {
    return {
      createGain: () => ({ connect() { }, gain: param() }),
      createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
      createBuffer: (channels, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
    };
  }
};

const { FIGHTER_CLASSES } = await import('./src/engine/fighterDefinitions.js');
const T = await import('./src/engine/tournament.js');
const {
  BYE_COUNT, TOTAL_MATCHES, TOURNAMENT_SIZE, ROUND_DEFINITIONS, ROUND_ORDER,
  allMatches, applyMatchResult, buildTournamentBracket, loadActiveTournament,
  nextPendingMatch, resolvedMatches, runTournamentMatch, saveActiveTournament,
  validateTournament
} = T;

const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

// --- 1. Roster + format constants -------------------------------------------
const classes = Object.keys(FIGHTER_CLASSES);
ok(classes.length === 25, `exactly 25 fighter classes exist (got ${classes.length})`);
ok(TOURNAMENT_SIZE === 25, `TOURNAMENT_SIZE is 25 (got ${TOURNAMENT_SIZE})`);
ok(BYE_COUNT === 7, `BYE_COUNT is 7 (got ${BYE_COUNT})`);
ok(TOTAL_MATCHES === 24, `TOTAL_MATCHES is 24 (got ${TOTAL_MATCHES})`);

const expected = { preliminary: 9, round16: 8, quarterfinal: 4, semifinal: 2, final: 1 };
for (const [key, count] of Object.entries(expected)) {
  const def = ROUND_DEFINITIONS.find(d => d.key === key);
  ok(Boolean(def), `round "${key}" is defined`);
  ok(def?.matches === count, `round "${key}" has ${count} matches (got ${def?.matches})`);
}
const sum = ROUND_DEFINITIONS.reduce((a, d) => a + d.matches, 0);
ok(sum === 24, `round definitions sum to 24 matches (got ${sum})`);
ok(ROUND_ORDER.length === 5, `5 rounds exist (got ${ROUND_ORDER.length})`);
// 18 prelim fighters + 7 byes = 25 entrants into the Round of 16.
ok(expected.preliminary * 2 + BYE_COUNT === 16, '9 prelim winners + 7 byes = 16 in the Round of 16');
ok(expected.round16 * 2 === 16, 'Round of 16 holds 16 classes in 8 matches');
ok(expected.quarterfinal * 2 === 8 && expected.semifinal * 2 === 4 && expected.final * 2 === 2, 'later rounds halve correctly');

// --- 2. A fresh bracket matches the spec ------------------------------------
const bracket = buildTournamentBracket();
const byes = bracket.byes.map(b => b.name);
const prelimFighters = bracket.rounds.preliminary.matches.flatMap(m => [m.first, m.second]);
ok(bracket.byes.length === 7, `7 byes drawn (got ${bracket.byes.length})`);
ok(bracket.rounds.preliminary.matches.length === 9, `9 preliminary matches drawn (got ${bracket.rounds.preliminary.matches.length})`);
ok(prelimFighters.length === 18, `18 classes in the preliminary round (got ${prelimFighters.length})`);
const entrants = new Set([...prelimFighters, ...byes]);
ok(entrants.size === 25, `25 unique entrants (got ${entrants.size})`);
ok(entrants.size === classes.length && classes.every(c => entrants.has(c)), 'every one of the 25 classes enters exactly once');
ok(prelimFighters.every(n => !byes.includes(n)), 'no class is both in a prelim match and a bye');
ok(byes.every(n => Boolean(FIGHTER_CLASSES[n])), 'every bye is a real class');
ok(validateTournament(bracket).length === 0, `fresh bracket validates (${validateTournament(bracket)[0] || 'ok'})`);

// --- 3. Play all 24 matches and confirm the progression ---------------------
const tournament = buildTournamentBracket();
const perRound = {};
let guard = 0;
while (guard++ < 40) {
  const match = nextPendingMatch(tournament);
  if (!match) break;
  const result = runTournamentMatch(match.first, match.second, { arenaSize: T.TOURNAMENT_ARENA_SIZE });
  ok(Boolean(result?.winner && result?.loser), `${match.id}: produced a valid winner (${result?.winner?.name ?? result?.error})`);
  if (!result?.winner) break;
  const { applied } = applyMatchResult(tournament, match, result);
  ok(applied, `${match.id}: result applied to the bracket`);
  perRound[match.round] = (perRound[match.round] || 0) + 1;
}
ok(perRound.preliminary === 9, `played 9 preliminary matches (got ${perRound.preliminary})`);
ok(perRound.round16 === 8, `played 8 Round of 16 matches (got ${perRound.round16})`);
ok(perRound.quarterfinal === 4, `played 4 quarterfinals (got ${perRound.quarterfinal})`);
ok(perRound.semifinal === 2, `played 2 semifinals (got ${perRound.semifinal})`);
ok(perRound.final === 1, `played 1 grand final (got ${perRound.final})`);
ok(resolvedMatches(tournament).length === 24, `24 matches resolved (got ${resolvedMatches(tournament).length})`);
ok(tournament.status === 'complete' && Boolean(tournament.champion), `tournament completed with champion ${tournament.champion}`);
ok(validateTournament(tournament, { requireComplete: true }).length === 0, 'completed bracket validates');
// The champion must not have been knocked out by an earlier loss.
const lossOfChampion = allMatches(tournament).find(m => m.loser === tournament.champion && m.round !== 'final');
ok(!lossOfChampion, 'champion was never eliminated before the final');
// Exactly 24 distinct classes were eliminated (25 entrants - 1 champion).
ok(new Set(tournament.eliminated).size === 24, `24 classes eliminated (got ${new Set(tournament.eliminated).size})`);

// --- 4. Save an UNFINISHED tournament and resume it exactly -----------------
store.clear();
const partial = buildTournamentBracket();
for (let i = 0; i < 3; i++) {
  const m = nextPendingMatch(partial);
  const r = runTournamentMatch(m.first, m.second, { arenaSize: T.TOURNAMENT_ARENA_SIZE });
  applyMatchResult(partial, m, r);
}
saveActiveTournament(partial); // simulates closing the program mid-tournament
const saved = store.get(T.TOURNAMENT_SAVE_KEY ?? 'orbital-clash-tournament-active') ?? store.values().next().value;
ok(Boolean(saved), 'an unfinished tournament is written to storage');
const resumed = loadActiveTournament();
ok(Boolean(resumed), 'the unfinished tournament loads back from storage');
ok(resumed?.status === 'active', `resumed tournament is still active (got ${resumed?.status})`);
ok(resolvedMatches(resumed).length === 3, `resumed with 3 resolved matches (got ${resolvedMatches(resumed).length})`);
ok(resumed.byes.map(b => b.name).join('|') === partial.byes.map(b => b.name).join('|'), 'the 7 byes survive the save/resume round-trip');
ok(resumed.participants.length === 25, `all 25 participants survive (got ${resumed.participants.length})`);
ok(nextPendingMatch(resumed)?.id === nextPendingMatch(partial)?.id, 'resumes at the same pending match, not from scratch');
const played = allMatches(resumed).filter(m => m.status === 'resolved');
ok(played.length === 3 && played.every(m => m.winner && m.loser && Number.isFinite(m.durationSeconds)), 'every resumed result keeps winner, loser and duration');

// --- 5. A COMPLETED tournament is not resumed -------------------------------
saveActiveTournament(tournament); // tournament above is complete
const afterComplete = loadActiveTournament();
ok(afterComplete === null, 'a completed tournament clears the resume slot');
saveActiveTournament(tournament, { keepComplete: true });
ok(loadActiveTournament() !== null, 'keepComplete:true still persists a finished bracket when asked');
store.clear();
ok(loadActiveTournament() === null, 'an empty save slot loads as null');

// --- 6. Malformed saves are rejected rather than half-loaded ----------------
const good = buildTournamentBracket();
const key = 'orbital-clash-tournament-active';
const tryLoad = (label, mutate) => {
  const raw = JSON.parse(JSON.stringify(good));
  mutate(raw);
  store.set(key, JSON.stringify(raw));
  ok(loadActiveTournament() === null, `${label} is rejected (no corrupt half-bracket)`);
};
store.set(key, JSON.stringify(good));
ok(loadActiveTournament() !== null, 'control: the untouched save loads');
tryLoad('a save with only 5 byes', raw => { raw.byes = raw.byes.slice(0, 5); });
tryLoad('a save with a wrong-sized round', raw => { raw.rounds.preliminary.matches.pop(); });
tryLoad('a save with 24 participants', raw => { raw.participants.pop(); });
tryLoad('a save naming an unknown class', raw => { raw.rounds.preliminary.matches[0].first = 'Not A Class'; });
tryLoad('a save with a bogus winner', raw => { raw.rounds.preliminary.matches[0].winner = 'Not A Class'; });

console.log(`\n${fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} CHECK(S) FAILED`}`);
process.exit(fails.length === 0 ? 0 : 1);
