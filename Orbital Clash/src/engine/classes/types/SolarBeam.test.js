import test from 'node:test';
import assert from 'node:assert/strict';
import { FighterFactory } from '../../FighterFactory.js';
import { installTestAudio } from '../../audio/testAudioStub.js';

installTestAudio();

test('solar beam cooldown starts at 8 and decreases by 10% per landed hit to 2 seconds', () => {
  const solar = FighterFactory.createFighter('Solar Beam', 100, 100);
  const victim = FighterFactory.createFighter('Gunner', 300, 100);
  victim.health = victim.maxHealth = 10000;
  assert.equal(solar.cooldown, 8);
  for (let hit = 0; hit < 20; hit++) {
    solar.beamActive = true;
    solar.hasHit = false;
    solar.beamAngle = 0;
    solar.beamProjectile = { x: victim.x, y: victim.y, distance: 0 };
    solar.cooldownTimer = solar.cooldown;
    solar.damageCooldown = 0;
    solar.update(0, victim);
    assert.ok(Math.abs(solar.cooldown - Math.max(2, 8 * 0.9 ** (hit + 1))) < 1e-9);
    assert.ok(Math.abs(solar.cooldownTimer - solar.cooldown) < 1e-9);
  }
});
