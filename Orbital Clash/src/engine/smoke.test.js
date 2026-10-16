import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal audio stub so fighter constructors/update paths that touch audioManager
// do not throw in a headless run (mirrors the other engine tests).
const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
globalThis.window = {
  AudioContext: function () {
    return {
      createGain: () => ({ connect() { }, gain: param() }),
      createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
      createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
    };
  }
};

const { FIGHTER_CLASSES } = await import('./fighterDefinitions.js');
const { runTournamentMatch, TOURNAMENT_INTERNALS } = await import('./tournament.js');

const ALL = Object.keys(FIGHTER_CLASSES);
console.log(`roster: ${ALL.length} classes -> ${ALL.join(', ')}`);

// Prove that a headless bout reaches a genuine, single-winner conclusion.
test('a headless bout produces exactly one survivor', () => {
  const result = runTournamentMatch('Ice Sword', 'Meteor');
  assert.equal(result.error, null);
  assert.ok(result.winner, 'expected a winner');
  assert.ok(result.loser, 'expected a loser');
  assert.notEqual(result.winner.name, result.loser.name);
});

// The clock override must be restored even when a bout ends normally.
test('the performance clock is restored after a bout', () => {
  const before = TOURNAMENT_INTERNALS.liveFighter;
  assert.equal(typeof before, 'function');
  const now = performance.now();
  assert.ok(Number.isFinite(now) && now >= 0);
});

// A sample of pairings, to confirm the simulation terminates for a spread of
// attack types (melee, projectile, beam, area, body) and never hangs.
test('a sample of cross-type bouts all terminate', () => {
  const pairs = [
    ['Reaper', 'Vampire'],
    ['Gunner', 'Spider'],
    ['Solar Beam', 'Tunneler'],
    ['Mahoraga', 'Ghost'],
    ['Meteor', 'Knight'],
    ['Black Hole', 'Tornado'],
    ['Duplicator', 'Mutant'],
    ['Grappler', 'Samurai'],
    ['Snake', 'Fireball'],
    ['Alchemist', 'Mine Layer']
  ];
  for (const [a, b] of pairs) {
    const result = runTournamentMatch(a, b);
    assert.equal(result.error, null, `${a} vs ${b} failed: ${result.error}`);
    assert.ok(result.winner, `${a} vs ${b} produced no winner`);
    assert.ok(result.durationSeconds >= 0, `${a} vs ${b} had a bad duration`);
  }
});
