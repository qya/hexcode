import type { HexCell } from './types';
import { keyOf, neighborCoords } from './hexGrid';

export function addParityBytes(bytes: Uint8Array, parityCount: number): Uint8Array {
  const parity = new Uint8Array(parityCount);
  for (let i = 0; i < bytes.length; i += 1) parity[i % parityCount] ^= bytes[i];
  return Uint8Array.from([...bytes, ...parity]);
}

export function verifyParityBytes(bytes: Uint8Array, dataLength: number, parityCount: number): boolean {
  const expected = addParityBytes(bytes.slice(0, dataLength), parityCount).slice(dataLength);
  const actual = bytes.slice(dataLength, dataLength + parityCount);
  return expected.every((byte, i) => byte === actual[i]);
}

/**
 * HexCode's second correction layer exploits the six edge-sharing neighbors of
 * a hex cell. Ambiguous samples inherit a weighted consensus from confident
 * adjacent cells before byte-level parity/RS-style recovery runs.
 */
export function majorityVoteAmbiguousCells(cells: HexCell[], level: number, threshold = 0.55): {
  cells: HexCell[];
  corrected: number;
} {
  const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]));
  let corrected = 0;
  const next = cells.map((cell) => {
    if (cell.kind !== 'data' || cell.confidence >= threshold) return cell;
    const weights = new Array<number>(level).fill(0);
    for (const coord of neighborCoords(cell)) {
      const neighbor = byKey.get(keyOf(coord));
      if (neighbor?.kind === 'data') weights[neighbor.value] += neighbor.confidence;
    }
    const best = weights
      .map((weight, value) => ({ value, weight }))
      .sort((a, b) => b.weight - a.weight)[0];
    if (best.weight <= 0 || best.value === cell.value) return cell;
    corrected += 1;
    return { ...cell, value: best.value, confidence: Math.max(cell.confidence, 0.7) };
  });
  return { cells: next, corrected };
}
