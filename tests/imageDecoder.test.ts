import { describe, expect, it } from 'vitest';
import { encodeText } from '../src/core/encoder';
import { renderHexCodeRaster } from '../src/core/imageDecoder';
import { decodeRasterWasm, decodeRasterWasmWithMeta } from './helpers/wasmDecoder';

describe('wasm image decoder', () => {
  it('round trips ⬡code v2 PNG raster exports', async () => {
    const payload = 'hex lattice v2 image decode';
    const code = encodeText(payload, { formatVersion: 2, level: 8, ecLevel: 'M' });
    const raster = renderHexCodeRaster(code, { width: 640, height: 556 });
    expect(await decodeRasterWasm(raster)).toBe(payload);
  });

  it('round trips v2 at multiple EC levels', async () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      const payload = `ec ${ecLevel}`;
      const code = encodeText(payload, { formatVersion: 2, level: 8, ecLevel });
      const raster = renderHexCodeRaster(code, { width: 720, height: 626 });
      expect(await decodeRasterWasm(raster)).toBe(payload);
    }
  });

  it('round trips legacy v1 raster exports via WASM', async () => {
    const payload = 'https://example.com/code';
    const code = encodeText(payload, { formatVersion: 1, level: 8, ecLevel: 'M' });
    const raster = renderHexCodeRaster(code, { width: 640, height: 556 });
    const result = await decodeRasterWasmWithMeta(raster);
    expect(result.text).toBe(payload);
    expect(result.formatVersion).toBe(1);
  });
});
