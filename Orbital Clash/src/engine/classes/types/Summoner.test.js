import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { FighterFactory } from '../../FighterFactory.js';
import { FIGHTER_CLASSES } from '../../fighterDefinitions.js';
import { Summoner, SUMMON_INTERVAL, SUMMON_HEALTH, SUMMONS_PER_PULSE, SUMMONABLE_CLASSES } from './Summoner.js';
import { DamageSystem } from '../../systems/DamageSystem.js';
import { stepBattle, chooseTarget, isValidTarget, collectBodies, isTeammate } from '../../systems/BattleSimulation.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const bodyStats = {
  name: 'Brawler',
  color: '#fff',
  health: 100,
  damage: 10,
  speed: 4,
  bodySize: 40,
  attackType: 'Body',
  cooldown: 0,
  description: 'Test body'
};

const makeSummoner = (x = 400, y = 400) => {
  const summoner = FighterFactory.createFighter('Summoner', x, y);
  summoner.arenaSize = 800;
  return summoner;
};

test('the Summoner roster entry matches the spec', () => {
  const stats = FIGHTER_CLASSES.Summoner;
  assert.equal(stats.health, 75);
  assert.equal(stats.speed, 5);
  assert.equal(stats.bodySize, 40);
  assert.equal(stats.damage, 0);
  assert.equal(stats.attackType, 'Trail');
});

test('the factory builds a Summoner instance', () => {
  assert.ok(makeSummoner() instanceof Summoner);
});

test('the summonable pool is the roster minus Summoner', () => {
  assert.ok(!SUMMONABLE_CLASSES.includes('Summoner'));
  assert.ok(SUMMONABLE_CLASSES.includes('Duplicator'));
  assert.equal(SUMMONABLE_CLASSES.length, Object.keys(FIGHTER_CLASSES).length - 1);
});

test('every summonable class is equally likely to be summoned', () => {
  const originalRandom = Math.random;
  try {
    SUMMONABLE_CLASSES.forEach((name, index) => {
      const summoner = makeSummoner();
      let calls = 0;
      // The first roll picks the class; the bucket centre maps back to that index.
      Math.random = () => (calls++ === 0 ? (index + 0.5) / SUMMONABLE_CLASSES.length : 0.5);
      assert.equal(summoner.summonRandom().name, name);
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('a summoned Duplicator takes its clone swarm with it when the summon leaves play', () => {
  const summoner = makeSummoner();
  const duplicator = FighterFactory.createFighter('Duplicator', 400, 400);
  duplicator.arenaSize = 800;
  duplicator.owner = summoner;
  summoner.summons.push(duplicator);
  duplicator.spawnClone();
  duplicator.spawnClone();
  const clones = [...duplicator.clones];
  assert.equal(clones.length, 2);

  summoner.die(null);
  assert.ok(clones.every(clone => clone.isDead));
});

test('a pruned Duplicator summon also takes its clone swarm with it', () => {
  const summoner = makeSummoner();
  const duplicator = FighterFactory.createFighter('Duplicator', 400, 400);
  duplicator.arenaSize = 800;
  duplicator.owner = summoner;
  summoner.summons.push(duplicator);
  duplicator.spawnClone();
  const clones = [...duplicator.clones];

  duplicator.health = 0;
  summoner.update(0, null);
  assert.equal(summoner.summons.length, 0);
  assert.ok(clones.every(clone => clone.isDead));
});

test('the first summon pulse lands after 15 seconds, with two 15 HP summons', () => {
  const summoner = makeSummoner();
  for (let i = 0; i < SUMMON_INTERVAL - 1; i++) summoner.update(1, null);
  assert.equal(summoner.summons.length, 0, 'nothing is summoned before the 15 second mark');

  summoner.update(1, null);
  assert.equal(summoner.summons.length, SUMMONS_PER_PULSE);
  for (const summon of summoner.summons) {
    assert.equal(summon.owner, summoner);
    assert.equal(summon.health, SUMMON_HEALTH);
    assert.equal(summon.maxHealth, SUMMON_HEALTH);
    assert.ok(SUMMONABLE_CLASSES.includes(summon.name));
  }
});

test('summons repeat every 15 seconds', () => {
  const summoner = makeSummoner();
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  assert.equal(summoner.summons.length, SUMMONS_PER_PULSE * 2);
});

test('summons are kept out of top-level fighters but join the battle body list', () => {
  const summoner = makeSummoner();
  const enemy = FighterFactory.createFighter('Summoner', 700, 700);
  const fighters = [summoner, enemy];
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);

  const bodies = collectBodies(fighters);
  assert.equal(bodies.length, fighters.length + SUMMONS_PER_PULSE);
  for (const summon of summoner.summons) assert.ok(bodies.includes(summon));

  const { alive } = stepBattle(fighters, { dt: 1 / 60, arenaSize: 800, returnAlive: true });
  assert.equal(alive.length, fighters.length, 'victory and placement only count top-level fighters');
  for (const fighter of fighters) assert.ok(alive.includes(fighter));
});

test('a summoned Mutant keeps its 15 HP and only its damage mutates', () => {
  const summoner = makeSummoner();
  const mutant = FighterFactory.createFighter('Mutant', 400, 400);
  mutant.owner = summoner;
  mutant.health = SUMMON_HEALTH;
  mutant.maxHealth = SUMMON_HEALTH;

  for (let i = 0; i < 25; i++) {
    mutant.mutate();
    assert.equal(mutant.maxHealth, SUMMON_HEALTH);
    assert.equal(mutant.health, SUMMON_HEALTH);
    assert.ok(mutant.damage >= 10 && mutant.damage <= 100);
  }
});

test('a top-level Mutant still rerolls its max HP', () => {
  const mutant = FighterFactory.createFighter('Mutant', 400, 400);
  const before = mutant.maxHealth;
  let changed = false;
  for (let i = 0; i < 20 && !changed; i++) {
    mutant.mutate();
    changed = mutant.maxHealth !== before;
  }
  assert.ok(changed, 'a normal Mutant can still change its max HP');
});

test('teammates are never valid targets for each other', () => {
  const summoner = makeSummoner();
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  const [summon] = summoner.summons;

  assert.equal(isTeammate(summon, summoner), true);
  assert.equal(isValidTarget(summoner, summon), false);
  assert.equal(isValidTarget(summon, summoner), false);
  assert.equal(chooseTarget([summoner, summon], 0), null);
});

test('a summon targets enemies, not its own summoner', () => {
  const summoner = makeSummoner(100, 100);
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  const [summon] = summoner.summons;
  const enemy = FighterFactory.createFighter('Summoner', 700, 700);

  const bodies = [summoner, summon, enemy];
  assert.equal(chooseTarget(bodies, bodies.indexOf(summon)), enemy);
});

test('a summoner is not a body attacker, so it deals no touch damage', () => {
  const summoner = makeSummoner();
  assert.equal(DamageSystem.isBodyAttacker(summoner), false);
});

test('a teammate body touching its summoner does not damage it', () => {
  const summoner = makeSummoner(400, 400);
  const summon = new FighterBase(bodyStats, 400, 400);
  summon.owner = summoner;
  summoner.summons.push(summon);
  summoner.health = 75;

  stepBattle([summoner], { dt: 1 / 60, arenaSize: 800 });
  assert.equal(summoner.health, 75);
});

test('summons die with their summoner', () => {
  const summoner = makeSummoner();
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  const summons = [...summoner.summons];
  assert.equal(summons.length, SUMMONS_PER_PULSE);

  summoner.die(null);
  assert.equal(summoner.isDead, true);
  for (const summon of summons) assert.equal(summon.isDead, true);
  assert.equal(summoner.summons.length, 0);
});

test('dead summons are pruned so the summoner only tracks living ones', () => {
  const summoner = makeSummoner();
  for (let i = 0; i < SUMMON_INTERVAL; i++) summoner.update(1, null);
  summoner.summons[0].health = 0;
  summoner.summons[0].isDead = true;
  summoner.update(0, null);
  assert.equal(summoner.summons.length, 1);
});
