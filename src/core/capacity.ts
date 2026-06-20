import type { CellLevel, ECLevel, FormatVersion, HexCell } from './types';
import { FORMAT_VERSION_V2, isModernFormat } from './types';
import {
  generateAxialGrid,
  hexRenderFootprint,
  qrRenderFootprint,
  radiusForVersion,
  RENDER_QUIET_MARGIN_CELLS
} from './hexGrid';
import { hl3StructuralCellCount } from './hl3Patterns';
import { V3_HEADER_BITS } from './metaHl3';
import { buildPatternMap } from './patterns';

const EC_OVERHEAD: Record<ECLevel, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
/** HL3 stream ECC rate. */
const V3_EC_RATE: Record<ECLevel, number> = { L: 0.93, M: 0.85, Q: 0.75, H: 0.7 };
/** Hex cell area vs square module (same pitch) for density normalization. */
export const HEX_AREA_PER_CELL = Math.sqrt(3);

export interface CapacityBreakdown {
  totalDataCells: number;
  payloadCells: number;
  usableBits: number;
  streamOverheadBits: number;
  ecOverheadPercent: number;
  gridCells: number;
  structuralCells: number;
}

export interface DensityComparisonStats {
  hexSymbolArea: number;
  qrSymbolArea: number;
  hexPrintArea: number;
  qrPrintArea: number;
  hexDensity: number;
  qrDensity: number;
  hexPrintDensity: number;
  qrPrintDensity: number;
  densityRatio: number;
  printDensityRatio: number;
  advantage: number;
  printAdvantage: number;
  maxDensity: number;
  maxPrintDensity: number;
  quietMarginCells: number;
}

export interface CapacityOptions {
  reserveCenterLogo?: boolean;
  formatVersion?: FormatVersion;
}

export const MAX_HEX_VERSION = 40;

function dataChannelCells(version: number, options: CapacityOptions): number {
  const formatVersion = options.formatVersion ?? FORMAT_VERSION_V2;
  const radius = radiusForVersion(version);
  const gridCells = generateAxialGrid(radius).length;
  if (isModernFormat(formatVersion)) return gridCells - hl3StructuralCellCount(radius);
  return gridCells - buildPatternMap(radius, options).size;
}

export function getCapacity(
  version: number,
  ecLevel: ECLevel,
  level: CellLevel,
  options: CapacityOptions = {}
): number {
  const formatVersion = options.formatVersion ?? FORMAT_VERSION_V2;
  const totalDataCells = dataChannelCells(version, options);
  const bitsPerCell = Math.log2(level);
  if (isModernFormat(formatVersion)) {
    return Math.max(0, Math.floor(totalDataCells * bitsPerCell * V3_EC_RATE[ecLevel] - V3_HEADER_BITS));
  }
  return Math.max(0, Math.floor(totalDataCells * bitsPerCell * (1 - EC_OVERHEAD[ecLevel]) - 16));
}

export function trySmallestVersionForBits(
  bits: number,
  ecLevel: ECLevel,
  level: CellLevel,
  options: CapacityOptions = {}
): number | null {
  for (let version = 1; version <= MAX_HEX_VERSION; version += 1) {
    if (getCapacity(version, ecLevel, level, options) >= bits) return version;
  }
  return null;
}

export function smallestVersionForBits(
  bits: number,
  ecLevel: ECLevel,
  level: CellLevel,
  options: CapacityOptions = {}
): number {
  const version = trySmallestVersionForBits(bits, ecLevel, level, options);
  if (version == null) throw new Error('Payload exceeds ⬡code maximum capacity');
  return version;
}

export function getMaxCapacity(
  ecLevel: ECLevel,
  level: CellLevel,
  options: CapacityOptions = {}
): number {
  return getCapacity(MAX_HEX_VERSION, ecLevel, level, options);
}

export function getCapacityBreakdown(
  version: number,
  ecLevel: ECLevel,
  level: CellLevel,
  options: CapacityOptions = {}
): CapacityBreakdown {
  const formatVersion = options.formatVersion ?? FORMAT_VERSION_V2;
  const radius = radiusForVersion(version);
  const gridCells = generateAxialGrid(radius).length;
  const totalDataCells = dataChannelCells(version, options);
  const streamOverheadBits = isModernFormat(formatVersion) ? V3_HEADER_BITS : 16;
  return {
    totalDataCells,
    payloadCells: totalDataCells,
    usableBits: getCapacity(version, ecLevel, level, options),
    streamOverheadBits,
    ecOverheadPercent: (isModernFormat(formatVersion) ? 1 - V3_EC_RATE[ecLevel] : EC_OVERHEAD[ecLevel]) * 100,
    gridCells,
    structuralCells: isModernFormat(formatVersion) ? hl3StructuralCellCount(radius) : gridCells - totalDataCells
  };
}

/** Symbol + print density metrics aligned with HexCodeCanvas rendering. */
export function computeDensityComparison(
  usableBits: number,
  qrCapacity: number,
  gridCells: number,
  qrModules: number,
  cells: HexCell[]
): DensityComparisonStats {
  const hexSymbolArea = gridCells * HEX_AREA_PER_CELL;
  const qrSymbolArea = qrModules * qrModules;
  const hexPrint = hexRenderFootprint(cells);
  const qrPrint = qrRenderFootprint(qrModules);

  const hexDensity = usableBits / hexSymbolArea;
  const qrDensity = qrCapacity / qrSymbolArea;
  const hexPrintDensity = usableBits / hexPrint.area;
  const qrPrintDensity = qrCapacity / qrPrint.area;

  return {
    hexSymbolArea,
    qrSymbolArea,
    hexPrintArea: hexPrint.area,
    qrPrintArea: qrPrint.area,
    hexDensity,
    qrDensity,
    hexPrintDensity,
    qrPrintDensity,
    densityRatio: hexDensity / qrDensity,
    printDensityRatio: hexPrintDensity / qrPrintDensity,
    advantage: ((hexDensity - qrDensity) / qrDensity) * 100,
    printAdvantage: ((hexPrintDensity - qrPrintDensity) / qrPrintDensity) * 100,
    maxDensity: Math.max(hexDensity, qrDensity, 0.001),
    maxPrintDensity: Math.max(hexPrintDensity, qrPrintDensity, 0.001),
    quietMarginCells: RENDER_QUIET_MARGIN_CELLS
  };
}
