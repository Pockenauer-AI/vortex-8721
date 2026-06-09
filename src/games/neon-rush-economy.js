export const BASE_SPEED = 10;
export const MAX_SPEED = 40;
export const CHUNK_LENGTH = 22;
export const DIAMOND_MIN_DISTANCE = 2500;
export const DIAMOND_DISTANCE_OFFSET = 18;
export const DIAMOND_ROLL_MODULUS = 2147483647;

export const baseSpeedForDistance = distance => Math.min(MAX_SPEED, BASE_SPEED + 12 * (1 - Math.exp(-distance / 170)) + 18 * (1 - Math.exp(-distance / 1700)));
export const speedForDistance = (distance, boosted = false) => Math.max(boosted ? BASE_SPEED * 2 : BASE_SPEED, baseSpeedForDistance(distance));
export const diamondDistanceForChunk = chunk => 30 + chunk * CHUNK_LENGTH + DIAMOND_DISTANCE_OFFSET;
export const diamondRollForChunk = (chunk, seed) => ((chunk * 48271 + seed * 69621) % DIAMOND_ROLL_MODULUS) % 100;
export const hasDiamondForChunk = (chunk, seed) => diamondDistanceForChunk(chunk) >= DIAMOND_MIN_DISTANCE && diamondRollForChunk(chunk, seed) === 0;
