import test from 'node:test';
import assert from 'node:assert/strict';
import { lastBattleFor, clipForFighter } from './lastBattle.js';

const battle = (timestamp, participants, extra = {}) => ({
  timestamp,
  aborted: false,
  durationSeconds: 60,
  participants,
  ...extra
});

const match = (id, round, first, second, winner, durationSeconds = 30) => ({
  id, round, first, second, winner, loser: winner === first ? second : first, durationSeconds
});

test('returns null when the fighter has no recorded bouts', () => {
  assert.equal(lastBattleFor('Gunner', [], []), null);
});

test('reports a tournament match with its round label and rival', () => {
  const tournaments = [{
    completedAt: 500,
    matches: [match('m1', 'semifinal', 'Gunner', 'Ghost', 'Gunner', 45)]
  }];
  assert.deepEqual(lastBattleFor('Gunner', [], tournaments), {
    kind: 'tournament',
    at: 500,
    allies: [],
    rivals: ['Ghost'],
    round: 'Semifinals',
    durationSeconds: 45
  });
});

test('uses the latest match a fighter played within a tournament', () => {
  const tournaments = [{
    completedAt: 500,
    matches: [
      match('m1', 'quarterfinal', 'Gunner', 'Ghost', 'Gunner'),
      match('m2', 'final', 'Vanguard', 'Gunner', 'Vanguard')
    ]
  }];
  const last = lastBattleFor('Gunner', [], tournaments);
  assert.equal(last.round, 'Grand Final');
  assert.deepEqual(last.rivals, ['Vanguard']);
});

test('prefers the newer of a regular battle and a tournament match', () => {
  const battles = [battle(900, [
    { name: 'Gunner', won: false, placement: 2 },
    { name: 'Ghost', won: true, placement: 1 }
  ])];
  const tournaments = [{ completedAt: 500, matches: [match('m1', 'final', 'Gunner', 'Ghost', 'Gunner')] }];
  const last = lastBattleFor('Gunner', battles, tournaments);
  assert.equal(last.kind, 'battle');
  assert.deepEqual(last.rivals, ['Ghost']);
});

test('an aborted battle lists every other fighter as an opponent', () => {
  const battles = [battle(100, [
    { name: 'Gunner', won: false, placement: null },
    { name: 'Ghost', won: false, placement: null }
  ], { aborted: true })];
  assert.deepEqual(lastBattleFor('Gunner', battles, []), {
    kind: 'battle',
    at: 100,
    allies: [],
    rivals: ['Ghost'],
    durationSeconds: 60
  });
});

test('a team battle splits teammates from opponents', () => {
  const battles = [battle(100, [
    { name: 'Gunner', won: true, placement: 1 },
    { name: 'Ghost', won: true, placement: 2 },
    { name: 'Vanguard', won: false, placement: 3 }
  ])];
  const last = lastBattleFor('Ghost', battles, []);
  assert.deepEqual(last.allies, ['Gunner']);
  assert.deepEqual(last.rivals, ['Vanguard']);
});

test('shows the saved clip only for fighters in that latest battle', () => {
  const replayMeta = { savedAt: 1, fighters: [{ name: 'Gunner' }, { name: 'Ghost' }] };
  const battles = [battle(100, [
    { name: 'Gunner', won: true, placement: 1 },
    { name: 'Ghost', won: false, placement: 2 }
  ])];
  assert.equal(clipForFighter('Gunner', replayMeta, battles, []), replayMeta);
  assert.equal(clipForFighter('Ninja', replayMeta, battles, []), null);
});

test('hides the clip once a fighter has a newer tournament match', () => {
  const replayMeta = { savedAt: 1, fighters: [{ name: 'Gunner' }, { name: 'Ghost' }] };
  const battles = [battle(100, [
    { name: 'Gunner', won: true, placement: 1 },
    { name: 'Ghost', won: false, placement: 2 }
  ])];
  const tournaments = [{ completedAt: 500, matches: [match('m1', 'final', 'Gunner', 'Ninja', 'Gunner')] }];
  assert.equal(clipForFighter('Gunner', replayMeta, battles, tournaments), null);
});

test('shows no clip when none is saved', () => {
  assert.equal(clipForFighter('Gunner', null, [], []), null);
});

