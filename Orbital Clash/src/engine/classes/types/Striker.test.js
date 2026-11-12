import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Striker } from './Striker.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const strikerStats = {
  name: 'Striker',
  color: '#1f8a8a',
  health: 100,
  damage: 10,
  speed: 5,
  bodySize: 40,
  attackType: 'Beam',
  cooldown: 7,
  description: 'Striker'
};

const victimStats = {
  name: 'Victim',
  color: '#fff',
  health: 1000,
  damage: 5,
  speed: 4,
  bodySize: 40,
  attackType: 'Body',
  cooldown: 0,
  description: 'Victim'
};

const FRAME = 1 / 60;

// Steps the striker through `seconds` of play and reports the elapsed time after each frame.
function runFor(striker, opponent, seconds, onFrame = () => {}) {
  let now = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    now += FRAME;
    striker.update(FRAME, opponent);
    onFrame(now);
  }
  return now;
}

test('a plane flies 5 px per frame in a straight line', () => {
  const striker = new Striker(strikerStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  striker.update(FRAME, opponent);
  const plane = striker.planes[0];
  const before = { x: plane.x, y: plane.y };
  striker.update(FRAME, opponent);
  assert.ok(Math.abs(Math.hypot(plane.x - before.x, plane.y - before.y) - 5) < 1e-9);
});

test('the Striker launches a plane right away, then only again after 7 seconds', () => {
  const striker = new Striker(strikerStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  striker.update(FRAME, opponent);
  assert.equal(striker.planes.length, 1);
  assert.equal(striker.cooldownTimer, 7);
  const first = striker.planes[0];

  runFor(striker, opponent, 6.9, () => {
    assert.ok(striker.planes.every(plane => plane === first), 'no second plane before 7 s');
  });
  runFor(striker, opponent, 0.6);
  assert.ok(striker.planes.some(plane => plane !== first), 'a second plane launches at 7 s');
});

test('a plane drops four bombs about 0.2 s apart and then stops dropping', () => {
  const striker = new Striker(strikerStats, 200, 400);
  const opponent = new FighterBase(victimStats, 700, 400);
  const drops = [];
  const dropBomb = striker.dropBomb.bind(striker);
  let now = 0;
  striker.dropBomb = (x, y, arenaSize) => {
    drops.push(now);
    dropBomb(x, y, arenaSize);
  };
  for (let i = 0; i < 180; i++) {
    now += FRAME;
    striker.update(FRAME, opponent);
  }

  assert.equal(drops.length, 4);
  assert.ok(Math.abs(drops[0] - 0.2) < 0.05, 'the first bomb falls after 0.2 s');
  for (let i = 1; i < drops.length; i++) {
    assert.ok(Math.abs(drops[i] - drops[i - 1] - 0.2) < 0.05, 'bombs fall 0.2 s apart');
  }
});

test('a bomb blast deals 10 damage and throws the victim away from the blast', () => {
  const striker = new Striker(strikerStats, 200, 400);
  const victim = new FighterBase(victimStats, 225, 430);
  victim.dodgeChance = 0;
  const hp = victim.health;

  striker.detonate({ x: 220, y: 400 }, [victim]);

  assert.equal(hp - victim.health, 10);
  assert.ok(victim.vx > 0 && victim.vy > 0, 'victim is pushed away from the blast');
  assert.equal(victim.speedMultiplier, 3);
  assert.ok(victim.speedMultiplierTimer > 0);
});

test('a dodged bomb neither damages nor throws its target', () => {
  const striker = new Striker(strikerStats, 200, 400);
  const victim = new FighterBase(victimStats, 225, 430);
  victim.dodgeChance = 1;
  const hp = victim.health;
  const vx = victim.vx;

  striker.detonate({ x: 220, y: 400 }, [victim]);

  assert.equal(victim.health, hp);
  assert.equal(victim.vx, vx);
  assert.equal(victim.speedMultiplier ?? 1, 1);
});
