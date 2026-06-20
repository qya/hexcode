import { describe, expect, it } from 'vitest';
import { axialDistance } from '../src/core/hexGrid';
import { buildBlankCells, finderCenters, FINDER_PATTERN_RADIUS } from '../src/core/patterns';

describe('cell-based finder pattern', () => {
  it('builds outer eye, inner eye, and center marker from real hex cells', () => {
    const radius = 8;
    const level = 4;
    const cells = buildBlankCells(radius, level);
    const center = finderCenters(radius - FINDER_PATTERN_RADIUS)[0];
    const finderCells = cells.filter((cell) => cell.kind === 'finder' && axialDistance(cell, center) <= FINDER_PATTERN_RADIUS);

    expect(finderCells).toHaveLength(19);
    expect(finderCells.find((cell) => axialDistance(cell, center) === 0)?.value).toBe(level - 1);
    expect(finderCells.every((cell) => axialDistance(cell, center) !== 1 || cell.value === 0)).toBe(true);
    expect(finderCells.every((cell) => axialDistance(cell, center) !== 2 || cell.value === level - 1)).toBe(true);
  });
});
