import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Projectile } from '../Projectile.js';
import { Fireball } from './Fireball.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const stats = (name) => ({
  name,
  color: '#fff',
  health: 100,
  damage: 5,
  speed: 5,
  bodySize: 40,
  attackType: 'Projectile',
  cooldown: 3,
  description: name
});

test('A fireball hit deals no impact damage and its burn totals 5 over 5 seconds', () => {
  const fireball = new Fireball(stats('Fireball'), 100, 400);
  const victim = new FighterBase(stats('Dummy'), 300, 400);
  victim.vx = 0;
  victim.vy = 0;

  // Hold the volley timer so only the shot placed below is in play.
  fireball.attackTimer = 99;
  fireball.projectiles.push(new Projectile(290, 400, 1, 0, 0, fireball));

  // The first step lands the impact; the burn then runs for its full 5 seconds.
  fireball.update(1 / 60, victim);
  assert.equal(victim.totalDamageTaken, 0, 'the impact itself should deal no damage');

  for (let i = 0; i < 300; i++) {
    victim.x = 300;
    victim.y = 400;
    victim.vx = 0;
    victim.vy = 0;
    victim.update(1 / 60, fireball);
    fireball.update(1 / 60, victim);
    if ((i + 1) % 60 === 0) {
      assert.equal(victim.totalDamageTaken, (i + 1) / 60, 'each tick deals exactly 1 damage');
    }
  }

  assert.equal(victim.totalDamageTaken, 5);
});

const burnsOn = (fighter) => fighter.statusEffects.filter(e => e.name.startsWith('burn-'));

test('every fireball in a volley that lands together applies its own burn', () => {
  const fireball = new Fireball(stats('Fireball'), 100, 400);
  const victim = new FighterBase(stats('Dummy'), 300, 400);
  fireball.attackTimer = 99;
  for (let i = 0; i < 3; i++) {
    fireball.projectiles.push(new Projectile(290, 400, 1, 0, 0, fireball));
  }

  fireball.update(1 / 60, victim);

  assert.equal(burnsOn(victim).length, 3);
});

test('burns from separate Fireball fighters do not share a name', () => {
  const victim = new FighterBase(stats('Dummy'), 300, 400);
  for (let i = 0; i < 2; i++) {
    const fireball = new Fireball(stats('Fireball'), 100, 400);
    fireball.attackTimer = 99;
    fireball.projectiles.push(new Projectile(290, 400, 1, 0, 0, fireball));
    fireball.update(1 / 60, victim);
  }

  assert.equal(burnsOn(victim).length, 2);
});

test('burn stacks on one opponent cap at five', () => {
  const fireball = new Fireball(stats('Fireball'), 100, 400);
  const victim = new FighterBase(stats('Dummy'), 300, 400);
  fireball.attackTimer = 99;
  for (let i = 0; i < 6; i++) {
    fireball.projectiles.push(new Projectile(290, 400, 1, 0, 0, fireball));
  }

  fireball.update(1 / 60, victim);

  assert.equal(burnsOn(victim).length, 5);
});
