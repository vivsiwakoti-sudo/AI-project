import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveFeed, observeLiveFeed } from "./liveFeed.js";

const texts = events => events.map(event => event.text);

test("starting values are a baseline, and each fireball or berserker step is announced once", () => {
  const feed = createLiveFeed();
  const fireball = { name: "Fireball", shotsFired: 0, color: "#f80" };
  const berserker = { name: "Berserker", rotationSpeed: 1, color: "#f00" };
  const fighters = [fireball, berserker];

  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), []);

  fireball.shotsFired = 4;
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), []);
  fireball.shotsFired = 5;
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), ["Fireball is shooting 5 fireballs"]);
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), []);
  fireball.shotsFired = 10;
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), ["Fireball is shooting 10 fireballs"]);

  berserker.rotationSpeed = 2.1;
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), ["Berserker reached 200% speed"]);
});

test("a destruction is announced once and credited to the fighter that landed the killing blow", () => {
  const feed = createLiveFeed();
  const killer = { name: "Reaper", color: "#0f0", killedBy: null };
  const victim = { name: "Knight", color: "#00f", eliminatedAt: null, killedBy: null };
  const fighters = [killer, victim];

  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), []);

  victim.eliminatedAt = 12;
  victim.killedBy = killer;
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), ["Reaper destroyed Knight"]);
  assert.deepEqual(texts(observeLiveFeed(feed, fighters)), []);
});

test("a Mimic copying a special fighter does not trigger that fighter's milestones", () => {
  const feed = createLiveFeed();
  const mimic = { name: "Mimic", mimicForm: "Vampire", evolutionLevel: 0, color: "#999" };
  observeLiveFeed(feed, [mimic]);
  mimic.evolutionLevel = 2;
  assert.deepEqual(texts(observeLiveFeed(feed, [mimic])), []);
});
