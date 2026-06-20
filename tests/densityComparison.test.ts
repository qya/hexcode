import { describe, expect, it } from 'vitest';
import { computeDensityComparison, getCapacityBreakdown, HEX_AREA_PER_CELL } from '../src/core/capacity';
import { encodeText } from '../src/core/encoder';
import { hexRenderFootprint, qrRenderFootprint } from '../src/core/hexGrid';

describe('density comparison', () => {
  it('computes symbol and print density from the same encoded grid', () => {
    const code = encodeText('hello', { level: 8, ecLevel: 'M', formatVersion: 2 });
    const breakdown = getCapacityBreakdown(code.version, 'M', 8, { formatVersion: 2 });
    const qrModules = 21;
    const qrCapacity = Math.floor(qrModules * qrModules * 0.85);
    const stats = computeDensityComparison(breakdown.usableBits, qrCapacity, breakdown.gridCells, qrModules, code.cells);

    expect(stats.hexSymbolArea).toBe(breakdown.gridCells * HEX_AREA_PER_CELL);
    expect(stats.qrSymbolArea).toBe(qrModules * qrModules);
    expect(stats.hexPrintArea).toBe(hexRenderFootprint(code.cells).area);
    expect(stats.qrPrintArea).toBe(qrRenderFootprint(qrModules).area);
    expect(stats.hexDensity).toBeGreaterThan(0);
    expect(stats.hexPrintDensity).toBeLessThanOrEqual(stats.hexDensity);
  });

  it('computes ⬡code v2 density with compact structural overhead', () => {
    const v2 = getCapacityBreakdown(7, 'M', 8, { formatVersion: 2 });
    expect(v2.usableBits).toBeGreaterThan(0);
    expect(v2.structuralCells).toBeLessThan(v2.gridCells * 0.15);
  });
});
