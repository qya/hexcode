import type { AxialCoord, FormatVersion, HexCell } from './types';
import { axialDistance, generateAxialGrid, keyOf, neighborCoords } from './hexGrid';

export const finderCenters = (radius: number): AxialCoord[] => [
  { q: -radius, r: 0 },
  { q: 0, r: -radius },
  { q: radius, r: -radius }
];

export const CENTER_LOGO_RADIUS = 2;
export const FINDER_PATTERN_RADIUS = 2;

export interface PatternOptions {
  reserveCenterLogo?: boolean;
  formatVersion?: FormatVersion;
}

export function structuralCellCount(radius: number): number {
  return buildPatternMap(radius).size;
}

export function buildPatternMap(radius: number, options: PatternOptions = {}): Map<string, HexCell['kind']> {
  const map = new Map<string, HexCell['kind']>();
  for (const center of finderCenters(radius - FINDER_PATTERN_RADIUS)) {
    for (const coord of generateAxialGrid(radius)) {
      if (axialDistance(coord, center) <= FINDER_PATTERN_RADIUS) map.set(keyOf(coord), 'finder');
    }
  }
  if (options.reserveCenterLogo) {
    for (const coord of generateAxialGrid(radius)) {
      if (axialDistance(coord) <= CENTER_LOGO_RADIUS && !map.has(keyOf(coord))) map.set(keyOf(coord), 'quiet');
    }
  }
  if (radius >= 7) {
    const alignmentOffset = options.reserveCenterLogo ? CENTER_LOGO_RADIUS + 2 : 0;
    const alignmentCenter = { q: alignmentOffset, r: -alignmentOffset };
    if (!map.has(keyOf(alignmentCenter))) map.set(keyOf(alignmentCenter), 'alignment');
    for (const neighbor of neighborCoords(alignmentCenter)) {
      if (!map.has(keyOf(neighbor))) map.set(keyOf(neighbor), 'alignment');
    }
  }
  for (const coord of generateAxialGrid(radius)) {
    if (axialDistance(coord) === Math.max(2, radius - 3) && !map.has(keyOf(coord))) map.set(keyOf(coord), 'timing');
  }
  for (let q = -2; q <= 2; q += 1) {
    const coord = { q, r: radius - 2 };
    if (!map.has(keyOf(coord))) map.set(keyOf(coord), 'format');
  }
  return map;
}

export function finderPatternValue(coord: AxialCoord, radius: number, level: number): number {
  const distance = Math.min(...finderCenters(radius - FINDER_PATTERN_RADIUS).map((center) => axialDistance(coord, center)));
  if (distance === 0 || distance === FINDER_PATTERN_RADIUS) return level - 1;
  return 0;
}

export function structuralValue(
  kind: HexCell['kind'],
  coord: AxialCoord,
  level: number,
  radius: number
): number {
  if (kind === 'finder') return finderPatternValue(coord, radius, level);
  if (kind === 'alignment') return level - 1;
  if (kind === 'timing') {
    return axialDistance(coord) % 2 === 0 ? level - 1 : 0;
  }
  if (kind === 'format') return Math.abs(coord.q + coord.r) % 2;
  return 0;
}

export function buildBlankCells(radius: number, level: number, options: PatternOptions = {}): HexCell[] {
  const patterns = buildPatternMap(radius, options);
  return generateAxialGrid(radius).map((coord) => {
    const kind = patterns.get(keyOf(coord)) ?? 'data';
    return { ...coord, kind, value: structuralValue(kind, coord, level, radius), confidence: 1 };
  });
}
