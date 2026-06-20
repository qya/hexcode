import type { CellLevel, ECLevel, EncodedHexCode, FormatVersion, HexCell } from './types';
import { FORMAT_VERSION_V2, isModernFormat } from './types';
import { getMaxCapacity, MAX_HEX_VERSION, smallestVersionForBits } from './capacity';
import { addParityBytes } from './errorCorrection';
import { buildHl3BlankCells } from './hl3Patterns';
import { keyOf, radiusForVersion } from './hexGrid';
import { applyMetadataToCells, buildV3Stream, packMetadata } from './metaHl3';
import { metadataCells } from './hl3Patterns';
import { chooseMask, maskValue } from './masking';
import { buildBlankCells } from './patterns';
import { dataWavefrontOrder } from './wavefront';
import { dataSpiralOrder } from './hexGrid';

const PARITY_BY_EC: Record<ECLevel, number> = { L: 4, M: 8, Q: 12, H: 16 };

export interface EncodeOptions {
  version?: number;
  ecLevel?: ECLevel;
  level?: CellLevel;
  centerLogo?: boolean;
  formatVersion?: FormatVersion;
}

export type EncodeErrorCode = 'CAPACITY_EXCEEDED' | 'VERSION_TOO_SMALL' | 'ENCODE_FAILED';

export interface EncodeError {
  code: EncodeErrorCode;
  message: string;
  payloadBytes: number;
  maxCapacityBits: number;
  /** Rough upper bound on UTF-8 payload bytes at current settings. */
  maxPayloadBytesEstimate: number;
  version?: number;
  suggestions: string[];
}

export type EncodeResult = { ok: true; code: EncodedHexCode } | { ok: false; error: EncodeError };

function describeEncodeFailure(error: unknown, text: string, options: EncodeOptions): EncodeError {
  const rawMessage = error instanceof Error ? error.message : 'Encoding failed';
  const formatVersion = options.formatVersion ?? FORMAT_VERSION_V2;
  const ecLevel = options.ecLevel ?? 'M';
  const level = options.level ?? (isModernFormat(formatVersion) ? 8 : 4);
  const capacityOptions = {
    reserveCenterLogo: options.centerLogo ?? false,
    formatVersion
  };
  const maxCapacityBits = getMaxCapacity(ecLevel, level, capacityOptions);
  const payloadBytes = new TextEncoder().encode(text).length;
  const maxPayloadBytesEstimate = Math.max(0, Math.floor(maxCapacityBits / 8));

  let code: EncodeErrorCode = 'ENCODE_FAILED';
  if (rawMessage.includes('maximum capacity')) code = 'CAPACITY_EXCEEDED';
  else if (rawMessage.includes('does not fit')) code = 'VERSION_TOO_SMALL';

  const suggestions = [
    'Shorten the payload text',
    isModernFormat(formatVersion)
      ? 'Use ⬡code with 8 cell levels (C8)'
      : 'Switch to ⬡code with 8 cell levels (C8)',
    ecLevel !== 'L' ? 'Lower error correction to level L' : 'Disable center logo reservation',
    options.centerLogo ? 'Disable center logo reservation' : 'Reduce special characters if the payload expands in UTF-8'
  ].filter((item, index, list) => list.indexOf(item) === index);

  const message =
    code === 'CAPACITY_EXCEEDED'
      ? `Payload exceeds the maximum ⬡code capacity (grid v${MAX_HEX_VERSION}, ${maxCapacityBits} usable bits).`
      : rawMessage;

  return {
    code,
    message,
    payloadBytes,
    maxCapacityBits,
    maxPayloadBytesEstimate,
    version: options.version,
    suggestions
  };
}

export function tryEncodeText(text: string, options: EncodeOptions = {}): EncodeResult {
  try {
    return { ok: true, code: encodeText(text, options) };
  } catch (error) {
    return { ok: false, error: describeEncodeFailure(error, text, options) };
  }
}

export function encodeText(text: string, options: EncodeOptions = {}): EncodedHexCode {
  const formatVersion = options.formatVersion ?? FORMAT_VERSION_V2;
  const ecLevel = options.ecLevel ?? 'M';
  const level = options.level ?? (isModernFormat(formatVersion) ? 8 : 4);
  const hasCenterLogo = options.centerLogo ?? false;

  if (isModernFormat(formatVersion)) return encodeV2(text, { ...options, ecLevel, level, formatVersion: 2 });

  const bytes = new TextEncoder().encode(text);
  const header = Uint8Array.from([bytes.length >> 8, bytes.length & 255]);
  const parityCount = PARITY_BY_EC[ecLevel];
  const stream = addParityBytes(Uint8Array.from([...header, ...bytes]), parityCount);
  const version =
    options.version ??
    smallestVersionForBits(stream.length * 8, ecLevel, level, { reserveCenterLogo: hasCenterLogo, formatVersion: 1 });
  const radius = radiusForVersion(version);
  const cells = buildBlankCells(radius, level, { reserveCenterLogo: hasCenterLogo, formatVersion: 1 });
  const dataCells = dataSpiralOrder(cells);
  const values = bytesToLevels(stream, level);
  if (values.length > dataCells.length) {
    throw new Error(`Payload does not fit grid v${version}. Choose a larger version or shorten the payload.`);
  }
  const valueMap = new Map<string, number>();
  dataCells.forEach((cell, i) => valueMap.set(keyOf(cell), values[i] ?? 0));
  const maskId = chooseMask(cells, valueMap, level);
  const encodedCells: HexCell[] = cells.map((cell) =>
    cell.kind === 'data' ? { ...cell, value: maskValue(valueMap.get(keyOf(cell)) ?? 0, cell, level, maskId) } : cell
  );
  return {
    version,
    radius,
    level,
    ecLevel,
    maskId,
    formatVersion: 1,
    hasCenterLogo,
    cells: encodedCells,
    payloadLength: bytes.length
  };
}

function encodeV2(text: string, options: EncodeOptions & { ecLevel: ECLevel; level: CellLevel; formatVersion: 2 }): EncodedHexCode {
  const ecLevel = options.ecLevel;
  const level = options.level;
  const hasCenterLogo = options.centerLogo ?? false;
  const parityCount = PARITY_BY_EC[ecLevel];
  const stream = buildV3Stream(text, parityCount, addParityBytes);
  const version =
    options.version ??
    smallestVersionForBits(stream.length * 8, ecLevel, level, { reserveCenterLogo: hasCenterLogo, formatVersion: 2 });
  const radius = radiusForVersion(version);
  const cells = buildHl3BlankCells(radius, level, { reserveCenterLogo: hasCenterLogo, formatVersion: 2 });
  const dataCells = dataWavefrontOrder(cells);
  const values = bytesToLevels(stream, level);
  if (values.length > dataCells.length) {
    throw new Error(`Payload does not fit grid v${version}. Choose a larger version or shorten the payload.`);
  }

  const valueMap = new Map<string, number>();
  dataCells.forEach((cell, i) => valueMap.set(keyOf(cell), values[i] ?? 0));
  const maskId = chooseMask(cells, valueMap, level);
  const maskedCells: HexCell[] = cells.map((cell) =>
    cell.kind === 'data' ? { ...cell, value: maskValue(valueMap.get(keyOf(cell)) ?? 0, cell, level, maskId) } : cell
  );
  const metadataValues = packMetadata({
    formatVersion: FORMAT_VERSION_V2,
    ecLevel,
    maskId,
    version,
    payloadLength: new TextEncoder().encode(text).length
  });
  const metaOrder = metadataCells(maskedCells);
  const encodedCells = applyMetadataToCells(
    maskedCells,
    metadataValues,
    metaOrder.map((cell) => keyOf(cell))
  );

  return {
    version,
    radius,
    level,
    ecLevel,
    maskId,
    formatVersion: 2,
    hasCenterLogo,
    cells: encodedCells,
    payloadLength: new TextEncoder().encode(text).length
  };
}

export function bytesToLevels(bytes: Uint8Array, level: CellLevel): number[] {
  const bitsPerCell = Math.log2(level);
  const bits = [...bytes].flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
  const values: number[] = [];
  for (let i = 0; i < bits.length; i += bitsPerCell) {
    const group = bits.slice(i, i + bitsPerCell);
    while (group.length < bitsPerCell) group.push(0);
    values.push(group.reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  return values;
}
