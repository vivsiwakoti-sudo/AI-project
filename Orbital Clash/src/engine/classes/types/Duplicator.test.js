import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { FighterFactory } from '../../FighterFactory.js';
import { installTestAudio } from '../../audio/testAudioStub.js';
import { audioManager } from '../../audio/AudioManager.js';
import { Projectile } from '../Projectile.js';
import { stepBattle } from '../../systems/BattleSimulation.js';

installTestAudio();

const dummyStats = {
  name: 'Dummy',
  color: '#fff',
  health: 1000,
  damage: 2,
  speed: 4,
  bodySize: 40,
  attackType: 'Body',
  cooldown: 0,
  description: 'Dummy'
};

// Moves the victim onto or away from the Duplicator and runs only the parent's touch check,
// so clones spawned by the swarm don't add their own touches to the count.
const frame = (duplicator, victim, touching) => {
  victim.x = touching ? 100 : 700;
  duplicator.touchVictims = [victim];
  duplicator.checkTouchDamage(victim);
};

test('each new touch spawns a clone with no cooldown, and staying in contact does not', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const victim = new FighterBase(dummyStats, 100, 100);

  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 1, 'first touch spawns a clone');

  for (let i = 0; i < 120; i++) frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 1, 'staying in contact spawns no more clones');

  frame(duplicator, victim, false);
  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 2, 'a new touch spawns again immediately');
});

test('a contact that only physics sees after the Duplicator updated clones once, with no extra damage', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 300, 300);
  const other = new FighterBase(dummyStats, 600, 300);
  duplicator.touchVictims = [other];
  duplicator.checkTouchDamage(other);
  assert.equal(duplicator.totalClones, 0, 'no contact yet');

  // Physics pins the fighter to contact distance after the Duplicator's own update.
  other.x = 340;
  const healthBefore = other.health;
  duplicator.registerPhysicsContacts();
  assert.equal(duplicator.totalClones, 1, 'the physics-only contact spawns a clone');
  assert.equal(other.health, healthBefore, 'the physics pass deals no extra damage');

  duplicator.registerPhysicsContacts();
  assert.equal(duplicator.totalClones, 1, 'a contact that continues does not spawn again');
});

test('touches stop cloning once the swarm reaches 75 clones', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const victim = new FighterBase(dummyStats, 100, 100);
  duplicator.totalClones = 75;

  frame(duplicator, victim, true);
  assert.equal(duplicator.totalClones, 75, 'at 75 clones a touch no longer duplicates');
});

test('clones start with 15 HP at every generation', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  duplicator.spawnClone();
  duplicator.clones[0].spawnClone();

  assert.deepEqual(duplicator.clones.map(c => c.health), [15, 15]);
  assert.deepEqual(duplicator.clones.map(c => c.maxHealth), [15, 15]);
});

test('a fighter touching a clone deals 3 damage even when it is not the aim', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const aim = new FighterBase(dummyStats, 700, 700);
  const other = new FighterBase({ ...dummyStats, attackType: 'Melee' }, 300, 300);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  duplicator.victims = [aim, other];
  clone.x = other.x;
  clone.y = other.y;

  duplicator.updateClones(1 / 60, aim);

  assert.equal(clone.health, 12, 'the touch lands on the clone for 3');
});

test('a body fighter adds its normal contact damage to the clone contact damage', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const bodyFighter = new FighterBase({ ...dummyStats, name: 'Mutant', damage: 7 }, 300, 300);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  clone.x = bodyFighter.x;
  clone.y = bodyFighter.y;
  duplicator.applyCloneContact(clone, [bodyFighter]);

  assert.equal(clone.health, 5, '3 clone contact damage plus 7 body damage equals 10');
});

test('a clone deals its 2 touch damage to any fighter it touches, not only the aim', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const aim = new FighterBase(dummyStats, 700, 700);
  const other = new FighterBase(dummyStats, 300, 300);
  // The list the parent held when the clone was made must not decide what the clone can touch.
  duplicator.touchVictims = [aim];
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  duplicator.victims = [aim, other];
  clone.x = other.x;
  clone.y = other.y;

  duplicator.updateClones(1 / 60, aim);

  assert.equal(other.totalDamageTaken, 2, 'the clone bites the fighter it is touching');
});

test('a fighter resting against a clone deals its 3 damage once, not every frame', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const other = new FighterBase({ ...dummyStats, attackType: 'Melee' }, 300, 300);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  duplicator.victims = [other];
  clone.x = other.x;
  clone.y = other.y;

  for (let i = 0; i < 30; i++) duplicator.updateClones(1 / 60, other);

  assert.equal(clone.health, 12, 'staying in contact does not keep dealing damage');
});

test('five separate fighter contacts kill a clone and trigger its death effect', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const particles = {
    emit() {},
    ring() {},
    emitImpact() {}
  };
  duplicator.particleSystem = particles;
  const other = new FighterBase({ ...dummyStats, attackType: 'Melee' }, 300, 300);
  other.particleSystem = particles;
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  duplicator.victims = [other];
  const playDeathSfx = audioManager.playDeathSfx;
  let deathSounds = 0;
  audioManager.playDeathSfx = () => { deathSounds++; };

  try {
    for (let contact = 0; contact < 5; contact++) {
      clone.x = other.x;
      clone.y = other.y;
      clone.touchedBy.clear();
      duplicator.applyCloneContact(clone, [other]);
      clone.x += clone.radius + other.radius + 1;
    }

    assert.equal(clone.health, 0, 'five 3-damage contacts consume all 15 HP');
    assert.equal(clone.isDead, true, 'the clone is eliminated after the fifth contact');
    assert.equal(deathSounds, 1, 'the clone runs the normal death sound effect once');
    assert.equal(clone.particleSystem, particles, 'the clone receives the parent particle system');
  } finally {
    audioManager.playDeathSfx = playDeathSfx;
  }
});

test('ordinary projectiles can hit a Duplicator clone through the shared victim list', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const gunner = FighterFactory.createFighter('Gunner', 500, 500);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  clone.x = 300;
  clone.y = 300;
  gunner.cooldownTimer = 999;
  gunner.projectiles.push(new Projectile(clone.x, clone.y, 0, 0, 7, gunner));

  stepBattle([duplicator, gunner], { dt: 0, arenaSize: 800 });

  assert.equal(clone.health, 8, 'the clone takes the normal 7 projectile damage');
  assert.equal(gunner.projectiles.length, 0, 'the projectile is consumed on the clone');
});

test('mines explode normally when a Duplicator clone triggers them', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const mineLayer = FighterFactory.createFighter('Mine Layer', 500, 500);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  clone.x = 300;
  clone.y = 300;
  mineLayer.mineCooldown = 999;
  mineLayer.mines.push({ x: clone.x, y: clone.y, age: 0 });

  stepBattle([duplicator, mineLayer], { dt: 0, arenaSize: 800 });

  assert.equal(clone.health, 5, 'the clone takes the mine damage');
  assert.equal(mineLayer.mines.length, 0, 'the triggered mine is consumed');
});

test('Snake trail damage and slow effects apply to Duplicator clones', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  const snake = FighterFactory.createFighter('Snake', 500, 500);
  duplicator.spawnClone();
  const clone = duplicator.clones[0];
  clone.x = 300;
  clone.y = 300;
  snake.dropTimer = 999;
  snake.trail.push({ x: clone.x, y: clone.y, age: 0 });

  stepBattle([duplicator, snake], { dt: 0, arenaSize: 800 });

  assert.equal(clone.health, 13, 'the clone takes the trail contact damage');
  assert.ok(clone.statusEffects.some(effect => effect.name === 'trail-slow'));
});

test('killing the original runs every clone through die(), the same death as the original', () => {
  const duplicator = FighterFactory.createFighter('Duplicator', 100, 100);
  duplicator.spawnClone();
  duplicator.spawnClone();
  duplicator.clones[0].spawnClone();
  const dying = [];
  for (const clone of duplicator.clones) {
    const die = clone.die.bind(clone);
    clone.die = (particles) => { dying.push(clone); die(particles); };
  }

  duplicator.killCloneTree();

  assert.equal(dying.length, 3, 'each clone dies through die()');
  assert.ok(duplicator.clones.every(c => c.isDead), 'every clone is dead');
});

test('a swarm dying at the same moment plays one death sound, not one per clone', () => {
  const ctx = audioManager.ensureContext();
  const createOscillator = ctx.createOscillator;
  let oscillators = 0;
  ctx.createOscillator = (...args) => { oscillators++; return createOscillator.apply(ctx, args); };
  ctx.currentTime = 500;

  try {
    audioManager.playDeathSfx();
    const firstDeath = oscillators;
    audioManager.playDeathSfx();
    audioManager.playDeathSfx();
    assert.ok(firstDeath > 0, 'the first death plays its sound');
    assert.equal(oscillators, firstDeath, 'the rest of the same-moment deaths are silent');
  } finally {
    ctx.createOscillator = createOscillator;
  }
});
