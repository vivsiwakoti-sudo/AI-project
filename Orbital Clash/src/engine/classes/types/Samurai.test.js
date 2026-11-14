import test from 'node:test';
import assert from 'node:assert/strict';

import { FighterBase } from '../FighterBase.js';
import { Samurai } from './Samurai.js';
import { DamageSystem } from '../../systems/DamageSystem.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

const samuraiStats = {
  name: 'Samurai',
  color: '#ffffff',
  health: 150,
  damage: 6,
  speed: 5,
  bodySize: 44,
  attackType: 'Melee',
  cooldown: 3,
  description: 'Samurai'
};

const opponentStats = { ...samuraiStats, name: 'Opponent', health: 1000 };

const FRAME = 1 / 60;

test('an invisible Samurai takes no damage from any category', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 700, 400);
  samurai.performCombo(opponent);

  for (const category of ['Melee', 'Projectile', 'Body', 'AOE', 'Beam']) {
    assert.equal(DamageSystem.applyDamage(opponent, samurai, 20, category, { ignoreCooldown: true }), false, category);
  }
  assert.equal(samurai.health, 150);
});

test('the Samurai takes damage again once the 5 second invisibility ends', () => {
  const samurai = new Samurai(samuraiStats, 200, 400);
  const opponent = new FighterBase(opponentStats, 700, 400);
  samurai.dodgeChance = 0;
  samurai.performCombo(opponent);

  for (let i = 0; i < Math.round(5.1 * 60); i++) samurai.update(FRAME, opponent);

  assert.equal(samurai.isInvisible, false);
  assert.equal(samurai.isInvulnerable, false);
  // The walk can let the katana reach the opponent and pause its attacks, and the opponent is never updated to clear that.
  opponent.attackPauseTimer = 0;
  assert.equal(DamageSystem.applyDamage(opponent, samurai, 20, 'Melee', { ignoreCooldown: true }), true);
  assert.equal(samurai.health, 130);
});
