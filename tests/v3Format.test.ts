import { describe, expect, it } from 'vitest';
import { getCapacityBreakdown, HEX_AREA_PER_CELL } from '../src/core/capacity';
import { decodeHexCode } from '../src/core/decoder';
import { encodeText } from '../src/core/encoder';
import {
  HL3_HEX_RADIUS,
  HL3_HEX_VERSION,
  buildHl3PatternMap,
  hl3StructuralCellCount
} from '../src/core/hl3Patterns';
import { radiusForVersion } from '../src/core/hexGrid';
import { V3_HEADER_BITS } from '../src/core/metaHl3';
import { normalizeFormatVersion } from '../src/core/types';

describe('⬡code v2', () => {
  it('uses radius 11 with at most 40 structural cells', () => {
    expect(radiusForVersion(HL3_HEX_VERSION)).toBe(HL3_HEX_RADIUS);
    const structural = hl3StructuralCellCount(HL3_HEX_RADIUS);
    expect(structural).toBeLessThanOrEqual(40);
    expect(buildHl3PatternMap(HL3_HEX_RADIUS).kinds.size).toBe(structural);
  });

  it('round trips text at C8 level M', () => {
    const code = encodeText('hex lattice v2 payload', { formatVersion: 2, level: 8, ecLevel: 'M' });
    expect(code.formatVersion).toBe(2);
    expect(code.level).toBe(8);
    const result = decodeHexCode(code);
    expect(result.text).toBe('hex lattice v2 payload');
    expect(result.formatVersion).toBe(2);
  });

  it('round trips at all C8 EC levels', () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      const code = encodeText('ec sweep', { formatVersion: 2, level: 8, ecLevel });
      expect(decodeHexCode(code).text).toBe('ec sweep');
    }
  });

  it('meets H11 capacity target at version 7', () => {
    const breakdown = getCapacityBreakdown(HL3_HEX_VERSION, 'M', 8, { formatVersion: 2 });
    expect(breakdown.gridCells).toBe(397);
    expect(breakdown.structuralCells).toBeLessThanOrEqual(40);
    expect(breakdown.structuralCells / breakdown.gridCells).toBeLessThan(0.15);
    expect(breakdown.usableBits).toBeGreaterThanOrEqual(870);
    expect(breakdown.streamOverheadBits).toBe(V3_HEADER_BITS);
  });

  it('beats QR symbol density benchmark', () => {
    const breakdown = getCapacityBreakdown(HL3_HEX_VERSION, 'M', 8, { formatVersion: 2 });
    const symbolArea = breakdown.gridCells * HEX_AREA_PER_CELL;
    const symbolDensity = breakdown.usableBits / symbolArea;
    expect(symbolDensity).toBeGreaterThan(0.85);
  });

  it('normalizes legacy on-wire format version 3 to v2 when decoding', () => {
    const code = encodeText('legacy wire format', { formatVersion: 2, level: 8, ecLevel: 'M' });
    expect(decodeHexCode({ ...code, formatVersion: 3 as never }).formatVersion).toBe(2);
    expect(normalizeFormatVersion(3)).toBe(2);
  });

  it('keeps legacy v1 backward compatibility', () => {
    const code = encodeText('legacy v1 path', { formatVersion: 1, level: 4 });
    expect(code.formatVersion).toBe(1);
    expect(decodeHexCode(code).text).toBe('legacy v1 path');
  });
});
