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

test('Mutant damage bands are 70% 10-24, 20% 25-70, 10% 71-100', () => {
  const mutant = FighterFactory.createFighter('Mutant', 400, 400);
  const realRandom = Math.random;
  // First value picks the band, second picks the damage inside it; anything after is 0.
  const damageFor = (bandRoll, withinBand) => {
    const values = [bandRoll, withinBand];
    Math.random = () => (values.length ? values.shift() : 0);
    mutant.mutate();
    return mutant.damage;
  };
  try {
    assert.equal(damageFor(0, 0), 10);
    assert.equal(damageFor(0.699, 0.999), 24);
    assert.equal(damageFor(0.7, 0), 25);
    assert.equal(damageFor(0.899, 0.999), 70);
    assert.equal(damageFor(0.9, 0), 71);
    assert.equal(damageFor(0.999, 0.999), 100);
  } finally {
    Math.random = realRandom;
  }
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

test('ranged fighters in a duel prefer the opposing summoner over a closer summon', () => {
  const summoner = makeSummoner(600, 100);
  const summon = new FighterBase(bodyStats, 100, 200);
  summon.owner = summoner;
  for (const name of ['Gunner', 'Gambler', 'Alchemist', 'Spearman', 'Ninja', 'Tunneler', 'Solar Beam', 'Dragon', 'Striker']) {
    const ranged = FighterFactory.createFighter(name, 100, 100);
    ranged.target = summon;
    assert.equal(chooseTarget([ranged, summoner, summon], 0, [ranged, summoner]), summoner, name);
  }
});

test('a Mimic using a ranged copied form prefers the summoner in a duel', () => {
  const summoner = makeSummoner(600, 100);
  const summon = new FighterBase(bodyStats, 100, 200);
  summon.owner = summoner;
  const mimic = FighterFactory.createFighter('Mimic', 100, 100);
  for (const form of ['Dragon', 'Fireball', 'Black Hole']) {
    mimic.startCopiedForm(form);
    assert.equal(chooseTarget([mimic, summoner, summon], 0, [mimic, summoner]), summoner, form);
    mimic.endCopiedForm();
  }
});

test('a duel passes the summoner to a ranged fighter without making summons unhittable', () => {
  const summoner = makeSummoner(600, 100);
  const summon = new FighterBase(bodyStats, 100, 200);
  summon.owner = summoner;
  summoner.summons.push(summon);
  const gambler = FighterFactory.createFighter('Gambler', 100, 100);
  gambler.target = summon;

  stepBattle([gambler, summoner], { dt: 0, arenaSize: 800 });

  assert.equal(gambler.opponent, summoner);
  assert.ok(gambler.victims.includes(summon));
  assert.equal(gambler.dice.length, 1);
  assert.ok(gambler.dice[0].vx > 0);
  assert.equal(gambler.dice[0].vy, 0);
});

test('a ranged summon in a duel aims at the enemy summoner, not either side\'s summons', () => {
  const owner = makeSummoner(100, 100);
  const enemy = makeSummoner(600, 100);
  const ranged = FighterFactory.createFighter('Gambler', 200, 100);
  const enemySummon = new FighterBase(bodyStats, 300, 100);
  ranged.owner = owner;
  enemySummon.owner = enemy;
  owner.summons.push(ranged);
  enemy.summons.push(enemySummon);

  stepBattle([owner, enemy], { dt: 0, arenaSize: 800 });

  assert.equal(ranged.opponent, enemy);
  assert.ok(ranged.victims.includes(enemySummon));
  assert.ok(!ranged.victims.includes(owner));
});

test('melee fighters and ranged fighters in larger fights retain their usual targets', () => {
  const summoner = makeSummoner(600, 100);
  const summon = new FighterBase(bodyStats, 100, 200);
  summon.owner = summoner;
  const melee = new FighterBase(bodyStats, 100, 100);
  const ranged = FighterFactory.createFighter('Gambler', 100, 100);
  const third = new FighterBase(bodyStats, 700, 700);
  third.isDead = true;

  assert.equal(chooseTarget([melee, summoner, summon], 0, [melee, summoner]), summon);
  assert.equal(chooseTarget([ranged, summoner, summon, third], 0), summon);

  summoner.summons.push(summon);
  stepBattle([ranged, summoner, third], { dt: 0, arenaSize: 800 });
  assert.equal(ranged.opponent, summon);
});

test('ranged duel fighters fall back to summons when the main opponent is unreachable', () => {
  const summoner = makeSummoner(600, 100);
  const summon = new FighterBase(bodyStats, 100, 200);
  summon.owner = summoner;
  const ranged = FighterFactory.createFighter('Gambler', 100, 100);
  const bodies = [ranged, summoner, summon];
  const duel = [ranged, summoner];

  summoner.isUnderground = true;
  assert.equal(chooseTarget(bodies, 0, duel), summon);
  summoner.isUnderground = false;
  assert.equal(chooseTarget(bodies, 0, duel), summoner);
  summoner.health = 0;
  assert.equal(chooseTarget(bodies, 0, duel), summon);
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
