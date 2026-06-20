import { describe, expect, it } from 'vitest';
import { tryEncodeText } from '../src/core/encoder';

const text = 'https://example.com/code';

describe('legacy format version selection', () => {
  it('auto-selects a v1 grid large enough for the default generator payload', () => {
    const failures: string[] = [];
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      for (const level of [2, 4, 8] as const) {
        for (const centerLogo of [false, true]) {
          const result = tryEncodeText(text, { level, ecLevel, centerLogo, formatVersion: 1 });
          if (!result.ok) {
            failures.push(
              `level=${level} ec=${ecLevel} logo=${centerLogo}: ${result.error.code} — ${result.error.message}`
            );
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
