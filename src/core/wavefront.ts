import type { AxialCoord, HexCell } from './types';
import { axialDistance, axialToPixel } from './hexGrid';

/**
 * HelixCode wavefront ordering: expand ring-by-ring from center, traversing each
 * ring clockwise from the north vertex. Matches isotropic hex wavefront propagation
 * and keeps neighboring data cells close in the encoded stream.
 */
export function dataWavefrontOrder(cells: HexCell[]): HexCell[] {
  return [...cells]
    .filter((cell) => cell.kind === 'data')
    .sort(
      (a, b) =>
        axialDistance(a) - axialDistance(b) ||
        ringTraversalIndex(a) - ringTraversalIndex(b) ||
        a.q - b.q ||
        a.r - b.r
    );
}

/** Clockwise ring walk from the north vertex (flat-top hex). */
export function hexRingCoords(center: AxialCoord, radius: number): AxialCoord[] {
  if (radius === 0) return [center];
  const clockwise = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: 0, r: -1 },
    { q: 1, r: -1 }
  ];
  const results: AxialCoord[] = [];
  let q = center.q;
  let r = center.r - radius;
  for (const dir of clockwise) {
    for (let step = 0; step < radius; step += 1) {
      results.push({ q, r });
      q += dir.q;
      r += dir.r;
    }
  }
  return results;
}

/** Position on a hex ring (1 … 6d) for stable clockwise ordering from north. */
export function ringTraversalIndex({ q, r }: AxialCoord): number {
  const d = axialDistance({ q, r });
  if (d === 0) return 0;
  const ring = hexRingCoords({ q: 0, r: 0 }, d);
  const idx = ring.findIndex((c) => c.q === q && c.r === r);
  if (idx >= 0) return idx + 1;
  const { x, y } = axialToPixel({ q, r }, 1);
  return Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * d * 6) + 1;
}

/** Shell assignment by wavefront ring distance. */
export type ShellKind = 'core' | 'mid' | 'outer';

export function shellForDistance(distance: number, maxDistance: number): ShellKind {
  if (maxDistance <= 0) return 'core';
  const coreBound = Math.max(1, Math.floor(maxDistance * 0.2));
  const midBound = Math.max(coreBound + 1, Math.floor(maxDistance * 0.65));
  if (distance <= coreBound) return 'core';
  if (distance <= midBound) return 'mid';
  return 'outer';
}

export function maxDataDistance(cells: HexCell[]): number {
  return cells.filter((c) => c.kind === 'data').reduce((max, c) => Math.max(max, axialDistance(c)), 0);
}
