import test from "node:test";
import assert from "node:assert/strict";

import { FighterFactory } from "../../FighterFactory.js";
import { installTestAudio } from "../../audio/testAudioStub.js";

installTestAudio();

test("Ghost Mode lasts 4 seconds after it activates", () => {
  const ghost = FighterFactory.createFighter("Ghost", 100, 400);
  ghost.ghostTimer = 0;
  ghost.update(1 / 60, null);
  assert.equal(ghost.isGhost, true, "the ghost form should activate");

  for (let t = 0; t < 3.5; t += 1 / 60) ghost.update(1 / 60, null);
  assert.equal(ghost.isGhost, true, "the ghost form should still be active at 3.5 seconds");

  for (let t = 0; t < 0.6; t += 1 / 60) ghost.update(1 / 60, null);
  assert.equal(ghost.isGhost, false, "the ghost form should end after 4 seconds");
});
