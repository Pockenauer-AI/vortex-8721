import test from "node:test";
import assert from "node:assert/strict";
import { BASE_SPEED, diamondDistanceForChunk, diamondRollForChunk, hasDiamondForChunk, speedForDistance } from "../src/games/neon-rush-economy.js";

test("diamonds never spawn before 2,500 meters", () => {
  for (let chunk = 0; diamondDistanceForChunk(chunk) < 2500; chunk++) assert.equal(hasDiamondForChunk(chunk, 123456), false);
});

test("diamond rolls are deterministic and use a one-percent bucket", () => {
  const rolls = Array.from({ length: 10000 }, (_, chunk) => diamondRollForChunk(chunk + 200, 987654321));
  assert.deepEqual(rolls, Array.from({ length: 10000 }, (_, chunk) => diamondRollForChunk(chunk + 200, 987654321)));
  assert.ok(rolls.filter(roll => roll === 0).length >= 90 && rolls.filter(roll => roll === 0).length <= 110);
  assert.equal(Array.from({ length: 9888 }, (_, index) => index + 112).find(chunk => hasDiamondForChunk(chunk, 123456789)), 175);
});

test("2x start never drops below double base speed and rejoins the normal curve", () => {
  assert.equal(speedForDistance(0, false), BASE_SPEED);
  assert.equal(speedForDistance(0, true), BASE_SPEED * 2);
  assert.equal(speedForDistance(100000, true), speedForDistance(100000, false));
});
