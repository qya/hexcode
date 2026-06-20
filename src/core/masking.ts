import type { HexCell } from './types';
import { neighborCoords, keyOf } from './hexGrid';

export const MASK_IDS = [0, 1, 2, 3] as const;

export function maskValue(value: number, cell: HexCell, level: number, maskId: number): number {
  const delta = ((cell.q * 31 + cell.r * 17 + maskId * 13) % level + level) % level;
  return (value + delta) % level;
}

export function unmaskValue(value: number, cell: HexCell, level: number, maskId: number): number {
  const delta = ((cell.q * 31 + cell.r * 17 + maskId * 13) % level + level) % level;
  return (value - delta + level) % level;
}

export function chooseMask(cells: HexCell[], values: Map<string, number>, level: number): number {
  return MASK_IDS.map((id) => ({ id, score: scoreMask(cells, values, level, id) })).sort(
    (a, b) => a.score - b.score
  )[0].id;
}

function scoreMask(cells: HexCell[], values: Map<string, number>, level: number, maskId: number): number {
  const masked = new Map<string, number>();
  for (const cell of cells) {
    if (cell.kind === 'data') masked.set(keyOf(cell), maskValue(values.get(keyOf(cell)) ?? 0, cell, level, maskId));
  }
  let penalty = 0;
  for (const cell of cells.filter((c) => c.kind === 'data')) {
    const value = masked.get(keyOf(cell)) ?? 0;
    const sameNeighbors = neighborCoords(cell).filter((n) => masked.get(keyOf(n)) === value).length;
    penalty += sameNeighbors > 2 ? sameNeighbors : 0;
    if (value === level - 1) penalty += 0.2;
  }
  return penalty;
}
