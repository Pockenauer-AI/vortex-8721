export const DEFAULT_SIZE = 5;
export const DEFAULT_MINE_COUNT = 18;

export const indexFor = (x, y, z, size = DEFAULT_SIZE) => z * size * size + y * size + x;
export const coordinatesFor = (index, size = DEFAULT_SIZE) => ({ x: index % size, y: Math.floor(index / size) % size, z: Math.floor(index / (size * size)) });

export const neighborIndices = (index, size = DEFAULT_SIZE) => {
  const { x, y, z } = coordinatesFor(index, size);
  const neighbors = [];
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy && !dz) || x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size || z + dz < 0 || z + dz >= size) continue;
    neighbors.push(indexFor(x + dx, y + dy, z + dz, size));
  }
  return neighbors;
};

export const createBoard = (size = DEFAULT_SIZE, mineCount = DEFAULT_MINE_COUNT) => ({
  size,
  mineCount,
  initialized: false,
  cells: Array.from({ length: size ** 3 }, (_, index) => ({ index, mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false }))
});

export const initializeBoard = (board, safeIndex, random = Math.random) => {
  if (board.initialized) return board;
  const excluded = new Set([safeIndex, ...neighborIndices(safeIndex, board.size)]);
  const candidates = board.cells.map(cell => cell.index).filter(index => !excluded.has(index));
  if (board.mineCount > candidates.length) throw new Error("Mine count exceeds available cells.");
  for (let index = candidates.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  candidates.slice(0, board.mineCount).forEach(index => board.cells[index].mine = true);
  board.cells.forEach(cell => cell.adjacent = cell.mine ? 0 : neighborIndices(cell.index, board.size).filter(index => board.cells[index].mine).length);
  board.initialized = true;
  return board;
};

const revealSafeArea = (board, startIndices) => {
  const queue = [...startIndices];
  const revealed = [];
  const queued = new Set(queue);
  while (queue.length) {
    const index = queue.shift();
    const cell = board.cells[index];
    if (!cell || cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    revealed.push(index);
    if (cell.adjacent) continue;
    neighborIndices(index, board.size).forEach(neighborIndex => {
      const neighbor = board.cells[neighborIndex];
      if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine && !queued.has(neighborIndex)) {
        queued.add(neighborIndex);
        queue.push(neighborIndex);
      }
    });
  }
  return revealed;
};

export const revealCell = (board, index) => {
  const cell = board.cells[index];
  if (!cell || cell.revealed || cell.flagged) return { revealed: [], hitMine: false };
  if (cell.mine) {
    cell.revealed = true;
    cell.exploded = true;
    return { revealed: [index], hitMine: true };
  }
  return { revealed: revealSafeArea(board, [index]), hitMine: false };
};

export const toggleFlag = (board, index) => {
  const cell = board.cells[index];
  if (!cell || cell.revealed) return false;
  cell.flagged = !cell.flagged;
  return true;
};

export const chordCell = (board, index) => {
  const cell = board.cells[index];
  if (!cell?.revealed || !cell.adjacent) return { revealed: [], hitMine: false };
  const neighbors = neighborIndices(index, board.size);
  if (neighbors.filter(neighborIndex => board.cells[neighborIndex].flagged).length !== cell.adjacent) return { revealed: [], hitMine: false };
  const revealed = [];
  for (const neighborIndex of neighbors) {
    const result = revealCell(board, neighborIndex);
    revealed.push(...result.revealed);
    if (result.hitMine) return { revealed, hitMine: true };
  }
  return { revealed, hitMine: false };
};

export const revealMines = board => board.cells.forEach(cell => {
  if (cell.mine) cell.revealed = true;
});

export const isSolved = board => board.initialized && board.cells.every(cell => cell.mine || cell.revealed);
export const flaggedCount = board => board.cells.filter(cell => cell.flagged).length;

export const formatMinesweeperTime = score => {
  const milliseconds = Math.max(0, Math.round(Number(score) || 0));
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const remainder = milliseconds % 1000;
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}` : `${seconds}.${String(remainder).padStart(3, "0")} s`;
};
