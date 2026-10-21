import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestAudio } from './audio/testAudioStub.js';
import '../testHarness.js';

// Same minimal environment the other headless engine tests use: no DOM, just the
// storage and Web Audio surface the engine touches.
const store = new Map();
// `installTestAudio` replaces window, so storage is added to it afterwards.
installTestAudio();
globalThis.window.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: key => { store.delete(key); }
};

const { buildTournamentBracket, nextPendingMatch, applyMatchResult, createTournamentBout, runTournamentMatch, TOURNAMENT_INTERNALS, MATCH_CLOCK_SECONDS, TOTAL_MATCHES } =
  await import('./tournament.js');

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

test('a watched bout steps to a real winner and then stops on its own', () => {
  const bracket = buildTournamentBracket({ random: seeded(17) });
  const match = nextPendingMatch(bracket);

  const bout = createTournamentBout(match.first, match.second);
  assert.ok(bout, 'the bout builds');

  // Every simulated frame must be a real combat frame: a class that throws must
  // not silently end the bout with no winner.
  const originalError = console.error;
  const failures = [];
  console.error = (...args) => { failures.push(args.map(String).join(' ')); };
  try {
    let frames = 0;
    while (!bout.finished && frames < 60 * 400) {
      bout.step(1 / 60);
      frames += 1;
    }
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(failures, [], 'no fighter threw during the bout');

  assert.equal(bout.finished, true, 'the bout reached a decision');
  assert.ok(bout.result, 'a result was produced');
  assert.ok(bout.result.winner, 'the winner exists');
  assert.ok(bout.result.loser, 'the loser exists');
  assert.notEqual(bout.result.winner.name, bout.result.loser.name);
  // The winner is one of the two fighters that walked in.
  assert.ok([match.first, match.second].includes(bout.result.winner.name));
  // Stepping after the end changes nothing.
  const before = bout.result;
  bout.step(1);
  assert.equal(bout.result, before);

  bout.destroy();
});

test('the bout results in a valid bracket advance', () => {
  let tournament = buildTournamentBracket({ random: seeded(23) });
  const match = nextPendingMatch(tournament);

  const bout = createTournamentBout(match.first, match.second);
  while (!bout.finished) bout.step(1 / 30);
  const applied = applyMatchResult(tournament, match, bout.result);
  bout.destroy();

  assert.equal(applied.applied, true);
  tournament = applied.tournament;
  assert.ok(tournament.resolvedMatchIds.includes(match.id));
  assert.ok(tournament.eliminated.includes(bout.result.loser.name));
  assert.equal(nextPendingMatch(tournament).id === match.id, false, 'the bracket moved on');
});

test('a bout stepped in 8x-sized frames still resolves inside the match clock', () => {
  // Speed only decides how many frames the screen gets to draw - the simulation
  // still advances in fixed 1/60 s combat steps, so a fast-forwarded bout ends
  // with a real winner exactly like a watched one. The budget comes from the match
  // clock itself plus a margin for the sudden-death drain, so shrinking the clock
  // cannot silently turn this into a test that never reaches the end.
  const MAX_LIVE_SECONDS = MATCH_CLOCK_SECONDS + 120;
  const bracket = buildTournamentBracket({ random: seeded(31) });
  const match = nextPendingMatch(bracket);

  const bout = createTournamentBout(match.first, match.second);
  let calls = 0;
  while (!bout.finished && bout.elapsedSeconds < MAX_LIVE_SECONDS) { bout.step(1 / 8); calls += 1; }
  assert.ok(calls > 0);
  assert.ok(bout.finished);
  assert.ok(bout.result.winner);
  bout.destroy();
});

test('an unbuildable bout returns null instead of throwing', () => {
  assert.equal(createTournamentBout('', 'Ninja'), null);
  assert.equal(createTournamentBout('Ninja', 'Ninja'), null);
  assert.equal(createTournamentBout('Not A Class', 'Ninja'), null);
});

test('the headless runner and a watched bout use the same shared combat step', () => {
  // Guard against the two modes drifting apart again: the runner is defined in
  // terms of the same bout + stepBattle path (this module's own contract).
  assert.equal(typeof TOURNAMENT_INTERNALS.liveFighter, 'function');
  const bracket = buildTournamentBracket({ random: seeded(41) });
  const match = nextPendingMatch(bracket);
  const result = runTournamentMatch(match.first, match.second);
  assert.equal(result.error, null);
  assert.ok(result.winner && result.loser);
  assert.equal(result.combatants.length, 2);
});

test('every match ends well inside the match clock and always names a winner', () => {
  // A tournament runs 24 bouts back to back, so a single pairing that cannot hurt
  // each other (or that out-heals the other) must still be decided quickly - the
  // sudden-death drain is what guarantees it. Without that, a spectator could sit
  // through the full clock on one stubborn matchup.
  const bracket = buildTournamentBracket({ random: seeded(53) });
  let tournament = bracket;
  let played = 0;
  let slowest = 0;

  while (true) {
    const match = nextPendingMatch(tournament);
    if (!match) break;
    const result = runTournamentMatch(match.first, match.second);
    assert.equal(result.error, null, `${match.first} vs ${match.second}: ${result.error}`);
    assert.ok(result.winner, `${match.first} vs ${match.second} produced no winner`);
    assert.ok(result.loser, `${match.first} vs ${match.second} produced no loser`);
    assert.ok(result.durationSeconds <= MATCH_CLOCK_SECONDS + 60,
      `${match.first} vs ${match.second} ran ${result.durationSeconds.toFixed(0)}s`);
    slowest = Math.max(slowest, result.durationSeconds);
    const applied = applyMatchResult(tournament, match, result);
    assert.equal(applied.applied, true);
    tournament = applied.tournament;
    played += 1;
  }

  assert.equal(played, TOTAL_MATCHES, 'a whole bracket advances without stalling');
  assert.equal(tournament.status, 'complete');
  assert.ok(tournament.champion);
  assert.ok(slowest <= MATCH_CLOCK_SECONDS + 60);
});
