import { describe, expect, it } from 'vitest';
import { parseSvgRasterSize } from '../src/core/rasterLoader';

describe('rasterLoader', () => {
  it('derives raster size from viewBox-only HexCode SVG exports', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -42 80 84"></svg>';
    expect(parseSvgRasterSize(svg, 640)).toEqual({ width: 640, height: 672 });
  });

  it('uses explicit width and height when present', () => {
    const svg = '<svg width="512" height="444" viewBox="-40 -42 80 84"></svg>';
    expect(parseSvgRasterSize(svg)).toEqual({ width: 512, height: 444 });
  });
});
