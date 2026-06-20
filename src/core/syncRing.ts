import type { AxialCoord } from './types';
import { axialDistance } from './hexGrid';
import { ringTraversalIndex } from './wavefront';

/** m-sequence LFSR for Gold-code construction. */
function mSequence(length: number, tap: number, seed: number): number[] {
  let register = seed & ((1 << 5) - 1) || 0x1f;
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    out.push(register & 1);
    const feedback = ((register >> tap) ^ (register >> 0)) & 1;
    register = ((register >> 1) | (feedback << 4)) & 0x1f;
  }
  return out;
}

/** Gold sequence: XOR of two m-sequences — low autocorrelation for rotation sync. */
export function goldSequence(length: number): number[] {
  const a = mSequence(length, 2, 0x1f);
  const b = mSequence(length, 1, 0x0f);
  return a.map((bit, i) => bit ^ b[i]);
}

const GOLD = goldSequence(127);

/**
 * HelixCode sync-ring cell value. Phase varies with ring position via Gold coding
 * so angular position is recoverable from a single ring sample (future image decode).
 */
export function syncRingValue(coord: AxialCoord, ringDistance: number, level: number): number {
  const phase = GOLD[(ringTraversalIndex(coord) + ringDistance * 7) % GOLD.length];
  const band = axialDistance(coord) % 3;
  const raw = (phase << 2) | (band % Math.max(2, level));
  return raw % level;
}
