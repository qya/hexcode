import { describe, expect, it } from 'vitest';
import { dataWavefrontOrder, hexRingCoords, ringTraversalIndex } from '../src/core/wavefront';
import { axialDistance } from '../src/core/hexGrid';
import type { HexCell } from '../src/core/types';

describe('wavefront ordering', () => {
  it('orders center before outer ring cells', () => {
    const cells: HexCell[] = [
      { q: 1, r: 0, kind: 'data', value: 0, confidence: 1 },
      { q: 0, r: 0, kind: 'data', value: 0, confidence: 1 },
      { q: 0, r: -1, kind: 'data', value: 0, confidence: 1 },
      { q: -1, r: 0, kind: 'data', value: 0, confidence: 1 }
    ];
    const ordered = dataWavefrontOrder(cells);
    expect(axialDistance(ordered[0])).toBe(0);
    expect(ordered.slice(1).every((c) => axialDistance(c) === 1)).toBe(true);
  });

  it('assigns unique ring indices on a generated ring', () => {
    const ring = hexRingCoords({ q: 0, r: 0 }, 2);
    expect(ring).toHaveLength(12);
    const indices = ring.map((c) => ringTraversalIndex(c));
    expect(new Set(indices).size).toBe(ring.length);
  });
});
