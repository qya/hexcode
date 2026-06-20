import type { CellLevel, ECLevel } from './types';
import { keyOf } from './hexGrid';
import type { HexCell } from './types';
import { HL3_METADATA_COUNT, metadataCells } from './hl3Patterns';

export { FORMAT_VERSION_V2 } from './types';
/** Protected metadata + stream header budget (bits). */
export const V3_HEADER_BITS = 32;

const EC_INDEX: Record<ECLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

export function buildV3Stream(text: string, parityCount: number, addParity: (b: Uint8Array, n: number) => Uint8Array): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const header = Uint8Array.from([bytes.length >> 8, bytes.length & 255]);
  return addParity(Uint8Array.from([...header, ...bytes]), parityCount);
}

export function parsePayloadLengthV3(bytes: Uint8Array): number {
  return (bytes[0] << 8) | bytes[1];
}

export function streamDataLengthV3(payloadLength: number): number {
  return 2 + payloadLength;
}

export function extractPayloadV3(bytes: Uint8Array, payloadLength: number): Uint8Array {
  return bytes.slice(2, 2 + payloadLength);
}

interface MetadataFields {
  formatVersion: number;
  ecLevel: ECLevel;
  maskId: number;
  version: number;
  payloadLength: number;
}

export function packMetadata(fields: MetadataFields): number[] {
  const bits: number[] = [];
  const pushBits = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  pushBits(fields.payloadLength, 16);
  pushBits(EC_INDEX[fields.ecLevel], 2);
  pushBits(fields.maskId & 3, 2);
  pushBits(fields.formatVersion, 3);
  pushBits(fields.version, 6);
  while (bits.length < HL3_METADATA_COUNT * 3) bits.push(0);
  const values: number[] = [];
  for (let i = 0; i < HL3_METADATA_COUNT; i += 1) {
    const slice = bits.slice(i * 3, i * 3 + 3);
    while (slice.length < 3) slice.push(0);
    values.push(slice.reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  return values;
}

export function unpackMetadata(values: number[]): MetadataFields {
  const bits = values.flatMap((value) => [((value >> 2) & 1) as 0 | 1, ((value >> 1) & 1) as 0 | 1, (value & 1) as 0 | 1]);
  let cursor = 0;
  const read = (width: number) => {
    const slice = bits.slice(cursor, cursor + width);
    cursor += width;
    return slice.reduce<number>((acc, bit) => (acc << 1) | bit, 0);
  };
  const payloadLength = read(16);
  const ecIndex = read(2);
  const maskId = read(2);
  const formatVersion = read(3);
  const version = read(6);
  const ecLevels: ECLevel[] = ['L', 'M', 'Q', 'H'];
  return {
    payloadLength,
    ecLevel: ecLevels[ecIndex] ?? 'M',
    maskId,
    formatVersion,
    version
  };
}

export function applyMetadataToCells(
  cells: HexCell[],
  metadataValues: number[],
  metadataKeys?: string[]
): HexCell[] {
  const keys =
    metadataKeys ??
    cells
      .filter((cell) => cell.kind === 'metadata')
      .map((cell) => keyOf(cell));
  const byKey = new Map(keys.map((key, index) => [key, metadataValues[index] ?? 0]));
  return cells.map((cell) => (cell.kind === 'metadata' ? { ...cell, value: byKey.get(keyOf(cell)) ?? cell.value } : cell));
}

export function readMetadataFromCells(cells: HexCell[]): MetadataFields {
  const values = metadataCells(cells).map((cell) => cell.value);
  return unpackMetadata(values);
}

export function metadataCellCount(_level: CellLevel): number {
  return HL3_METADATA_COUNT;
}
