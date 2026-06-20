import { describe, expect, it } from 'vitest';
import { HL3_HEX_VERSION } from '../src/core/hl3Patterns';
import { encodeText, tryEncodeText } from '../src/core/encoder';
import { renderHexCodeRaster } from '../src/core/imageDecoder';
import { decodeRasterWasm } from './helpers/wasmDecoder';

function largestEncodablePayload(): string {
  for (let len = 120; len >= 40; len -= 1) {
    const payload = 'A'.repeat(len);
    const result = tryEncodeText(payload, { formatVersion: 2, level: 8, ecLevel: 'M', version: HL3_HEX_VERSION });
    if (result.ok) return payload;
  }
  throw new Error('could not find encodable payload');
}

describe('wasm long payload', () => {
  it('round trips medium v2 payloads', async () => {
    for (const len of [20, 50, 80]) {
      const payload = 'A'.repeat(len);
      const code = encodeText(payload, { formatVersion: 2, level: 8, ecLevel: 'M' });
      const raster = renderHexCodeRaster(code, { width: 640, height: 556 });
      await expect(decodeRasterWasm(raster)).resolves.toBe(payload);
    }
  }, 30_000);

  it('round trips long v2 payloads near grid capacity', async () => {
    const payload = largestEncodablePayload();
    expect(payload.length).toBeGreaterThan(80);
    const code = encodeText(payload, { formatVersion: 2, level: 8, ecLevel: 'M', version: HL3_HEX_VERSION });
    const raster = renderHexCodeRaster(code, { width: 640, height: 556 });
    await expect(decodeRasterWasm(raster)).resolves.toBe(payload);
  }, 120_000);
});
