import { describe, expect, it } from 'vitest';
import { decodeHexCode } from '../src/core/decoder';
import { encodeText, tryEncodeText } from '../src/core/encoder';

describe('encoder/decoder', () => {
  it('round trips binary and multi-level payloads', () => {
    for (const level of [2, 4, 8] as const) {
      const code = encodeText('hexagons pack more levels', { level, ecLevel: 'M' });
      expect(decodeHexCode(code).text).toBe('hexagons pack more levels');
    }
  });

  it('returns a structured error instead of throwing when payload exceeds capacity', () => {
    const huge = 'x'.repeat(500_000);
    const result = tryEncodeText(huge, { formatVersion: 2, level: 8, ecLevel: 'H' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CAPACITY_EXCEEDED');
      expect(result.error.maxCapacityBits).toBeGreaterThan(0);
      expect(result.error.payloadBytes).toBeGreaterThan(result.error.maxPayloadBytesEstimate);
    }
  });

  it('returns version error when an explicit grid is too small', () => {
    const result = tryEncodeText('this payload needs more cells than version 1 allows', {
      formatVersion: 2,
      level: 2,
      ecLevel: 'M',
      version: 1
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VERSION_TOO_SMALL');
      expect(result.error.version).toBe(1);
    }
  });
});
