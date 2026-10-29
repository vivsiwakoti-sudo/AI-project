import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Reaper } from './Reaper.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const reaperStats = {
  name: 'Reaper',
  color: '#fff',
  health: 100,
  damage: 5,
  speed: 5,
  bodySize: 40,
  attackType: 'Melee',
  cooldown: 0.25,
  description: 'Reaper'
};

const dummy = (name) => new FighterBase({
  name,
  color: '#fff',
  health: 100000,
  damage: 1,
  speed: 5,
  bodySize: 40,
  attackType: 'Melee',
  cooldown: 0,
  description: name
}, 0, 0);

// One scythe swing at the target: the blade is aimed straight at it and the
// cooldown cleared, so every call lands exactly one hit. Returns the damage dealt.
const swing = (reaper, target) => {
  target.x = reaper.x + reaper.radius + 40;
  target.y = reaper.y;
  reaper.scytheAngle = 0;
  reaper.cooldownTimer = 0;
  const before = target.totalDamageTaken;
  reaper.update(1 / 6000, target);
  return target.totalDamageTaken - before;
};

test('Against an ordinary fighter the scythe keeps growing by 1.25x per hit', () => {
  const reaper = new Reaper(reaperStats, 400, 400);
  const target = dummy('Dummy');

  const hits = Array.from({ length: 8 }, () => swing(reaper, target));

  assert.ok(Math.abs(hits[0] - 5) < 1e-6, 'the first hit is the base damage');
  assert.ok(Math.abs(hits[7] - 5 * Math.pow(1.25, 7)) < 1e-3, 'the eighth hit is still scaling with no cap');
});

test('Against Mahoraga the scythe stops growing after 5 multiplications', () => {
  const reaper = new Reaper(reaperStats, 400, 400);
  const mahoraga = dummy('Mahoraga');
  const cap = 5 * Math.pow(1.25, 5);

  const hits = Array.from({ length: 10 }, () => swing(reaper, mahoraga));

  assert.ok(Math.abs(hits[0] - 5) < 1e-6, 'the first hit is the base damage');
  assert.ok(Math.abs(hits[5] - cap) < 1e-3, 'the sixth hit has had 5 multiplications');
  for (let i = 5; i < hits.length; i++) {
    assert.ok(Math.abs(hits[i] - cap) < 1e-3, `hit ${i + 1} stays at the 5-stack cap`);
  }
  assert.ok(Math.abs(reaper.currentDamage - cap) < 1e-3, 'hits on Mahoraga do not bank damage past the cap');
});

test('Damage built up on others is held to the cap against Mahoraga, and is kept for everyone else', () => {
  const reaper = new Reaper(reaperStats, 400, 400);
  const other = dummy('Dummy');
  const mahoraga = dummy('Mahoraga');
  const cap = 5 * Math.pow(1.25, 5);

  for (let i = 0; i < 9; i++) swing(reaper, other); // 9 stacks on an ordinary fighter
  const grown = reaper.currentDamage;
  assert.ok(grown > cap, 'the scythe has outgrown the Mahoraga cap');

  assert.ok(Math.abs(swing(reaper, mahoraga) - cap) < 1e-3, 'a big scythe is held to the cap against Mahoraga');
  assert.ok(Math.abs(reaper.currentDamage - grown) < 1e-6, 'hitting Mahoraga does not shrink the stored damage');
  assert.ok(Math.abs(swing(reaper, other) - grown * 1) < 1e-3, 'everyone else still takes the full scythe');
});
