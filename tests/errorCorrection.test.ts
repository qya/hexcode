import { describe, expect, it } from 'vitest';
import { majorityVoteAmbiguousCells } from '../src/core/errorCorrection';
import type { HexCell } from '../src/core/types';

describe('hex-neighbor majority voting', () => {
  it('corrects an ambiguous cell from six-neighbor consensus', () => {
    const center: HexCell = { q: 0, r: 0, kind: 'data', value: 0, confidence: 0.2 };
    const neighbors: HexCell[] = [
      { q: 1, r: 0, kind: 'data', value: 3, confidence: 0.9 },
      { q: 1, r: -1, kind: 'data', value: 3, confidence: 0.8 },
      { q: 0, r: -1, kind: 'data', value: 3, confidence: 0.7 },
      { q: -1, r: 0, kind: 'data', value: 1, confidence: 0.6 },
      { q: -1, r: 1, kind: 'data', value: 3, confidence: 0.9 },
      { q: 0, r: 1, kind: 'data', value: 2, confidence: 0.6 }
    ];
    const result = majorityVoteAmbiguousCells([center, ...neighbors], 4);
    expect(result.corrected).toBe(1);
    expect(result.cells[0].value).toBe(3);
  });
});
