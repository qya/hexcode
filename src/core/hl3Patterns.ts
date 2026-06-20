import type { AxialCoord, FormatVersion, HexCell, HexCellKind } from './types';
import { axialDistance, generateAxialGrid, hexRingCoords, keyOf } from './hexGrid';
import { goldSequence } from './syncRing';
import { dataWavefrontOrder } from './wavefront';

/** HL3-H11 default profile: regular hex radius 11 (397 cells, version 7). */
export const HL3_HEX_RADIUS = 11;
export const HL3_HEX_VERSION = HL3_HEX_RADIUS - 4;
export const HL3_PERIMETER_SYNC_COUNT = 14;
export const HL3_CALIBRATION_COUNT = 6;
export const HL3_METADATA_COUNT = 8;
export const HL3_FIDUCIAL_COUNT = 12;
export const HL3_STRUCTURAL_COUNT =
  HL3_FIDUCIAL_COUNT + HL3_PERIMETER_SYNC_COUNT + HL3_CALIBRATION_COUNT + HL3_METADATA_COUNT;

const FOUR_CORNERS = (radius: number): AxialCoord[] => [
  { q: -radius, r: 0 },
  { q: radius, r: -radius },
  { q: radius, r: 0 },
  { q: -radius, r: radius }
];

/** Asymmetric 3-cell triad pointing inward from each rectangular corner. */
function fiducialTriad(center: AxialCoord): AxialCoord[] {
  const inward =
    center.q !== 0
      ? { q: center.q - Math.sign(center.q), r: center.r }
      : { q: center.q, r: center.r - Math.sign(center.r) };
  const wing =
    center.q !== 0
      ? { q: center.q - Math.sign(center.q), r: center.r + Math.sign(center.r) }
      : { q: center.q + Math.sign(center.q), r: center.r - Math.sign(center.r) };
  return [center, inward, wing];
}

function calibrationCoords(radius: number): AxialCoord[] {
  const d = Math.max(3, Math.floor(radius * 0.36));
  return [
    { q: d, r: 0 },
    { q: -d, r: 0 },
    { q: 0, r: d },
    { q: 0, r: -d },
    { q: Math.floor(d / 2), r: Math.floor(d / 2) },
    { q: -Math.floor(d / 2), r: -Math.floor(d / 2) }
  ];
}

function metadataCoords(radius: number): AxialCoord[] {
  const ringDistance = Math.max(4, Math.floor(radius * 0.45));
  const ring = hexRingCoords({ q: 0, r: 0 }, ringDistance);
  const step = Math.max(1, Math.floor(ring.length / HL3_METADATA_COUNT));
  return ring.filter((_, index) => index % step === 0).slice(0, HL3_METADATA_COUNT);
}

function perimeterSyncCoords(radius: number, reserved: Set<string>): AxialCoord[] {
  const ring = hexRingCoords({ q: 0, r: 0 }, radius).filter((coord) => !reserved.has(keyOf(coord)));
  const step = Math.max(1, Math.floor(ring.length / HL3_PERIMETER_SYNC_COUNT));
  return ring.filter((_, index) => index % step === 0).slice(0, HL3_PERIMETER_SYNC_COUNT);
}

export interface Hl3PatternMap {
  kinds: Map<string, HexCellKind>;
  fiducialTriads: AxialCoord[][];
}

export function buildHl3PatternMap(radius: number): Hl3PatternMap {
  const kinds = new Map<string, HexCellKind>();
  const fiducialTriads = FOUR_CORNERS(radius).map(fiducialTriad);

  for (const triad of fiducialTriads) {
    for (const coord of triad) kinds.set(keyOf(coord), 'fiducial');
  }

  const reserved = new Set(kinds.keys());
  for (const coord of perimeterSyncCoords(radius, reserved)) {
    kinds.set(keyOf(coord), 'sync');
    reserved.add(keyOf(coord));
  }
  for (const coord of calibrationCoords(radius)) {
    if (!kinds.has(keyOf(coord))) {
      kinds.set(keyOf(coord), 'calibration');
      reserved.add(keyOf(coord));
    }
  }
  for (const coord of metadataCoords(radius)) {
    if (!kinds.has(keyOf(coord))) kinds.set(keyOf(coord), 'metadata');
  }

  return { kinds, fiducialTriads };
}

export function hl3StructuralCellCount(radius: number): number {
  return buildHl3PatternMap(radius).kinds.size;
}

const GOLD = goldSequence(127);

export function fiducialValue(coord: AxialCoord, triads: AxialCoord[][], level: number): number {
  for (let triadIndex = 0; triadIndex < triads.length; triadIndex += 1) {
    const triad = triads[triadIndex];
    const cellIndex = triad.findIndex((c) => c.q === coord.q && c.r === coord.r);
    if (cellIndex < 0) continue;
    const dark = level - 1;
    const patterns: number[][] = [
      [dark, 0, dark],
      [dark, dark, 0],
      [0, dark, dark],
      [dark, 0, 0]
    ];
    return patterns[triadIndex][cellIndex] ?? 0;
  }
  return 0;
}

export function syncCellValue(coord: AxialCoord, radius: number, level: number): number {
  const ring = hexRingCoords({ q: 0, r: 0 }, radius);
  const index = ring.findIndex((c) => c.q === coord.q && c.r === coord.r);
  const phase = GOLD[(index + radius * 5) % GOLD.length];
  return phase ? level - 1 : 0;
}

/** C8 palette anchors: light, dark, and four evenly spaced mid-tones. */
export function calibrationValue(index: number, level: number): number {
  const anchors = [0, level - 1];
  for (let step = 1; step < level - 1; step += 1) {
    if (anchors.length >= HL3_CALIBRATION_COUNT) break;
    anchors.push(step);
  }
  while (anchors.length < HL3_CALIBRATION_COUNT) anchors.push(Math.floor(level / 2));
  return anchors[index] ?? 0;
}

export function structuralHl3Value(
  kind: HexCellKind,
  coord: AxialCoord,
  level: number,
  radius: number,
  pattern: Hl3PatternMap,
  calibrationIndex: number
): number {
  if (kind === 'fiducial') return fiducialValue(coord, pattern.fiducialTriads, level);
  if (kind === 'sync') return syncCellValue(coord, radius, level);
  if (kind === 'calibration') return calibrationValue(calibrationIndex, level);
  return 0;
}

export interface Hl3PatternOptions {
  reserveCenterLogo?: boolean;
  formatVersion?: FormatVersion;
}

export function buildHl3BlankCells(radius: number, level: number, options: Hl3PatternOptions = {}): HexCell[] {
  const pattern = buildHl3PatternMap(radius);
  const calibrationKeys = calibrationCoords(radius)
    .filter((coord) => pattern.kinds.get(keyOf(coord)) === 'calibration')
    .map(keyOf);
  const calibrationIndexByKey = new Map(calibrationKeys.map((key, index) => [key, index]));

  return generateAxialGrid(radius).map((coord) => {
    const key = keyOf(coord);
    let kind = pattern.kinds.get(key) ?? 'data';
    if (options.reserveCenterLogo && axialDistance(coord) <= 2) kind = 'quiet';
    const value =
      kind === 'metadata'
        ? 0
        : kind === 'quiet'
          ? 0
          : kind === 'data'
            ? 0
            : structuralHl3Value(
                kind,
                coord,
                level,
                radius,
                pattern,
                calibrationIndexByKey.get(key) ?? 0
              );
    return { ...coord, kind, value, confidence: 1 };
  });
}

export function metadataCells(cells: HexCell[]): HexCell[] {
  return dataWavefrontOrder(cells.filter((cell) => cell.kind === 'metadata'));
}
