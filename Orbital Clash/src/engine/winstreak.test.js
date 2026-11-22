import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStreak } from "./winstreak.js";

test("a win extends the streak and a loss resets it", () => {
  assert.equal(nextStreak(undefined, true), 1);
  assert.equal(nextStreak(2, true), 3);
  assert.equal(nextStreak(3, false), 0);
  assert.equal(nextStreak(NaN, true), 1);
});
