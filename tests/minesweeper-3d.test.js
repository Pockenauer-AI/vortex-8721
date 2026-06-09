import test from "node:test";
import assert from "node:assert/strict";
import { chordCell, coordinatesFor, createBoard, flaggedCount, formatMinesweeperTime, indexFor, initializeBoard, isSolved, neighborIndices, revealCell, toggleFlag } from "../src/games/minesweeper-3d-logic.js";

test("3D coordinates and neighbor counts cover corners, faces, edges, and center", () => {
  assert.deepEqual(coordinatesFor(indexFor(3, 2, 4)), { x: 3, y: 2, z: 4 });
  assert.equal(neighborIndices(indexFor(0, 0, 0)).length, 7);
  assert.equal(neighborIndices(indexFor(2, 2, 0)).length, 17);
  assert.equal(neighborIndices(indexFor(2, 0, 0)).length, 11);
  assert.equal(neighborIndices(indexFor(2, 2, 2)).length, 26);
});

test("initialization places exactly 18 mines outside the first-click safety volume", () => {
  const board = createBoard();
  const safeIndex = indexFor(2, 2, 2);
  initializeBoard(board, safeIndex, () => 0.25);
  const mines = board.cells.filter(cell => cell.mine);
  assert.equal(mines.length, 18);
  assert.equal(new Set(mines.map(cell => cell.index)).size, 18);
  [safeIndex, ...neighborIndices(safeIndex)].forEach(index => assert.equal(board.cells[index].mine, false));
});

test("adjacent values count mines across all three dimensions", () => {
  const board = createBoard(3, 1);
  board.cells[indexFor(0, 0, 0, 3)].mine = true;
  board.initialized = true;
  board.cells.forEach(cell => cell.adjacent = cell.mine ? 0 : neighborIndices(cell.index, board.size).filter(index => board.cells[index].mine).length);
  assert.equal(board.cells[indexFor(1, 1, 1, 3)].adjacent, 1);
  assert.equal(board.cells[indexFor(2, 2, 2, 3)].adjacent, 0);
});

test("zero-cell reveal floods safe space without opening flagged cells", () => {
  const board = createBoard(3, 1);
  board.cells[indexFor(2, 2, 2, 3)].mine = true;
  board.initialized = true;
  board.cells.forEach(cell => cell.adjacent = cell.mine ? 0 : neighborIndices(cell.index, board.size).filter(index => board.cells[index].mine).length);
  const flaggedIndex = indexFor(1, 0, 0, 3);
  toggleFlag(board, flaggedIndex);
  revealCell(board, indexFor(0, 0, 0, 3));
  assert.equal(board.cells[flaggedIndex].revealed, false);
  assert.equal(board.cells.filter(cell => cell.revealed).length, 25);
});

test("flags and chording reveal remaining neighbors and can complete a board", () => {
  const board = createBoard(2, 1);
  const mineIndex = indexFor(0, 0, 0, 2);
  board.cells[mineIndex].mine = true;
  board.initialized = true;
  board.cells.forEach(cell => cell.adjacent = cell.mine ? 0 : neighborIndices(cell.index, board.size).filter(index => board.cells[index].mine).length);
  const center = indexFor(1, 1, 1, 2);
  revealCell(board, center);
  assert.equal(toggleFlag(board, mineIndex), true);
  assert.equal(flaggedCount(board), 1);
  const result = chordCell(board, center);
  assert.equal(result.hitMine, false);
  assert.equal(isSolved(board), true);
});

test("incorrect chording detonates an unflagged mine", () => {
  const board = createBoard(2, 1);
  const mineIndex = indexFor(0, 0, 0, 2);
  board.cells[mineIndex].mine = true;
  board.initialized = true;
  board.cells.forEach(cell => cell.adjacent = cell.mine ? 0 : neighborIndices(cell.index, board.size).filter(index => board.cells[index].mine).length);
  const center = indexFor(1, 1, 1, 2);
  revealCell(board, center);
  toggleFlag(board, indexFor(1, 0, 0, 2));
  assert.equal(chordCell(board, center).hitMine, true);
  assert.equal(board.cells[mineIndex].exploded, true);
});

test("time formatting supports short and minute-long runs", () => {
  assert.equal(formatMinesweeperTime(9245), "9.245 s");
  assert.equal(formatMinesweeperTime(75432), "1:15.432");
});
