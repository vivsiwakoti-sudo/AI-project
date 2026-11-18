import test from "node:test";
import assert from "node:assert/strict";

import { FighterFactory } from "../../FighterFactory.js";
import { CollisionSystem } from "../../systems/CollisionSystem.js";
import { installTestAudio } from "../../audio/testAudioStub.js";

installTestAudio();

test("Spearman pin damage reaches Mahoraga at its collision wall boundary", () => {
  const spearman = FighterFactory.createFighter("Spearman", 100, 400);
  const mahoraga = FighterFactory.createFighter("Mahoraga", 700, 400);
  spearman.arenaSize = mahoraga.arenaSize = 800;
  spearman.victims = [mahoraga];
  mahoraga.victims = [spearman];
  mahoraga.health = mahoraga.maxHealth = 1000;
  mahoraga.vx = 0;
  mahoraga.vy = 0;

  spearman.update(1 / 60, mahoraga);
  const spear = spearman.projectiles[0];
  spear.x = mahoraga.x - 1;
  spear.y = mahoraga.y;
  spear.vx = 12;
  spear.vy = 0;
  spearman.update(1 / 60, mahoraga);

  assert.equal(spear.isStuck, true);
  const healthAfterImpact = mahoraga.health;

  for (let frame = 0; frame < 90; frame++) {
    spearman.update(1 / 60, mahoraga);
    CollisionSystem.resolveFighterWall(mahoraga, 800);
  }

  assert.ok(
    mahoraga.health < healthAfterImpact,
    "the wall pin must keep ticking damage even when Mahoraga has a visual wall margin"
  );
  assert.ok(mahoraga.x < 800 - 20 - mahoraga.radius, "Mahoraga should stop at its wheel-aware wall boundary");
});
