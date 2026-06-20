import { describe, expect, it } from 'vitest';
import {
  axialToPixel,
  boundsForHexes,
  cellRenderRadius,
  clusterBoundaryEdges,
  clusterOutlinePath,
  gapClosingStroke,
  generateAxialGrid,
  hexRenderFootprint,
  hexVertices,
  neighborCoords,
  polygonPoints,
  qrRenderFootprint
} from '../src/core/hexGrid';

describe('hexGrid', () => {
  it('generates axial hex cells by radius', () => {
    expect(generateAxialGrid(1)).toHaveLength(7);
    expect(generateAxialGrid(2)).toHaveLength(19);
  });

  it('returns six edge-sharing neighbors', () => {
    expect(neighborCoords({ q: 0, r: 0 })).toHaveLength(6);
  });

  it('tiles adjacent cell polygons with a shared edge', () => {
    const size = 10;
    const radius = cellRenderRadius(size, 1);
    const center = axialToPixel({ q: 0, r: 0 }, size);
    const neighbor = axialToPixel({ q: 1, r: 0 }, size);
    const shared = hexVertices(center, radius).filter((point) =>
      hexVertices(neighbor, radius).some((other) => Math.hypot(point.x - other.x, point.y - other.y) < 0.001)
    );
    expect(shared).toHaveLength(2);
    expect(polygonPoints(center, radius).split(' ')).toHaveLength(6);
  });

  it('derives cluster bounds from rendered hexes', () => {
    const size = 10;
    const radius = cellRenderRadius(size, 1);
    const hexes = generateAxialGrid(1).map((coord) => ({
      center: axialToPixel(coord, size),
      radius
    }));
    const bounds = boundsForHexes(hexes);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(0);
  });

  it('closes render gaps when cellScale is below 1', () => {
    expect(gapClosingStroke(10, 1)).toBe(0);
    expect(gapClosingStroke(10, 0.94)).toBeGreaterThan(0);
  });

  it('builds a closed outline path around a hex cluster', () => {
    const size = 10;
    const radius = cellRenderRadius(size, 1);
    const cells = generateAxialGrid(2).map((coord) => ({ ...coord, radius }));
    const path = clusterOutlinePath(cells, size);
    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith(' Z')).toBe(true);
    expect(clusterBoundaryEdges(cells, size).length).toBeGreaterThan(0);
  });

  it('matches canvas viewBox footprint at unit pitch', () => {
    const cells = generateAxialGrid(2).map((coord) => ({ ...coord, kind: 'data' as const }));
    const footprint = hexRenderFootprint(cells);
    expect(footprint.width).toBeGreaterThan(0);
    expect(footprint.height).toBeGreaterThan(0);
    expect(footprint.area).toBeCloseTo(footprint.width * footprint.height);
    expect(qrRenderFootprint(21).area).toBe(23 * 23);
  });
});
