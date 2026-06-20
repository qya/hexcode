import type { DecodeResult, EncodedHexCode, HexCell } from './types';
import {
  FORMAT_VERSION_V2,
  isModernFormat,
  normalizeFormatVersion,
  type FormatVersion
} from './types';
import { majorityVoteAmbiguousCells, verifyParityBytes } from './errorCorrection';
import { dataSpiralOrder } from './hexGrid';
import {
  extractPayloadV3,
  parsePayloadLengthV3,
  readMetadataFromCells,
  streamDataLengthV3
} from './metaHl3';
import { dataWavefrontOrder } from './wavefront';
import { unmaskValue } from './masking';

const PARITY_BY_EC = { L: 4, M: 8, Q: 12, H: 16 } as const;
type DecodeInput = EncodedHexCode | HexCell[] | (Partial<EncodedHexCode> & { cells: HexCell[] });

export function decodeHexCode(code: DecodeInput): DecodeResult {
  const source = normalizeInput(code);
  const formatVersion = normalizeFormatVersion(source.formatVersion ?? FORMAT_VERSION_V2);

  if (isModernFormat(formatVersion)) return decodeV2(source);

  const voted = majorityVoteAmbiguousCells(source.cells, source.level);
  const ordered = dataSpiralOrder(voted.cells).map((cell) => ({
    ...cell,
    value: unmaskValue(cell.value, cell, source.level, source.maskId)
  }));
  const bytes = levelsToBytes(ordered.map((cell) => cell.value), source.level);
  const payloadLength = (bytes[0] << 8) | bytes[1];
  const dataLength = payloadLength + 2;
  const parityCount = PARITY_BY_EC[source.ecLevel];
  if (!verifyParityBytes(bytes, dataLength, parityCount)) {
    throw new Error('⬡code parity check failed; payload is too corrupted');
  }
  const payload = bytes.slice(2, 2 + payloadLength);
  return {
    text: new TextDecoder().decode(payload),
    correctedCells: voted.corrected,
    confidence: averageConfidence(voted.cells),
    formatVersion: 1
  };
}

function decodeV2(source: Required<Pick<EncodedHexCode, 'cells' | 'level' | 'maskId' | 'ecLevel'>>): DecodeResult {
  const metadata = readMetadataFromCells(source.cells);
  const maskId = source.maskId ?? metadata.maskId;
  const ecLevel = source.ecLevel ?? metadata.ecLevel;
  const level = source.level;
  const voted = majorityVoteAmbiguousCells(source.cells, level);
  const dataCells = dataWavefrontOrder(voted.cells.filter((cell) => cell.kind === 'data'));
  const ordered = dataCells.map((cell) => ({
    ...cell,
    value: unmaskValue(cell.value, cell, level, maskId)
  }));
  const bytes = levelsToBytes(ordered.map((cell) => cell.value), level);
  const payloadLength = parsePayloadLengthV3(bytes);
  const dataLength = streamDataLengthV3(payloadLength);
  const parityCount = PARITY_BY_EC[ecLevel];
  if (!verifyParityBytes(bytes, dataLength, parityCount)) {
    throw new Error('⬡code parity check failed; payload is too corrupted');
  }
  const payload = extractPayloadV3(bytes, payloadLength);
  return {
    text: new TextDecoder().decode(payload),
    correctedCells: voted.corrected,
    confidence: averageConfidence(voted.cells),
    formatVersion: FORMAT_VERSION_V2
  };
}

function inferFormatVersion(cells: HexCell[]): FormatVersion {
  const kinds = new Set(cells.map((cell) => cell.kind));
  if (kinds.has('fiducial') || kinds.has('metadata') || kinds.has('calibration') || kinds.has('sync')) {
    return FORMAT_VERSION_V2;
  }
  return 1;
}

function inferRadius(cells: HexCell[]): number {
  let maxDistance = 0;
  for (const cell of cells) {
    const distance = Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r));
    if (distance > maxDistance) maxDistance = distance;
  }
  return maxDistance;
}

function normalizeInput(code: DecodeInput): EncodedHexCode {
  if (Array.isArray(code)) {
    const formatVersion = inferFormatVersion(code);
    const radius = inferRadius(code);
    return {
      cells: code,
      level: isModernFormat(formatVersion) ? 8 : 4,
      maskId: 0,
      ecLevel: 'M',
      formatVersion,
      version: radius - 4,
      radius,
      hasCenterLogo: code.some((cell) => cell.kind === 'quiet'),
      payloadLength: 0
    };
  }
  const formatVersion = normalizeFormatVersion(code.formatVersion ?? inferFormatVersion(code.cells));
  const radius = code.radius ?? inferRadius(code.cells);
  return {
    version: code.version ?? radius - 4,
    radius,
    level: code.level ?? (isModernFormat(formatVersion) ? 8 : 4),
    ecLevel: code.ecLevel ?? 'M',
    maskId: code.maskId ?? 0,
    formatVersion,
    hasCenterLogo: code.hasCenterLogo ?? code.cells.some((cell) => cell.kind === 'quiet'),
    cells: code.cells,
    payloadLength: code.payloadLength ?? 0,
  };
}

export function levelsToBytes(values: number[], level: number): Uint8Array {
  const bitsPerCell = Math.log2(level);
  const bits = values.flatMap((value) =>
    Array.from({ length: bitsPerCell }, (_, i) => (value >> (bitsPerCell - 1 - i)) & 1)
  );
  const bytes: number[] = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    bytes.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  return Uint8Array.from(bytes);
}

function averageConfidence(cells: HexCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.confidence, 0) / cells.length;
}
