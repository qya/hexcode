import { describe, expect, it } from 'vitest';
import { encodeText } from '../src/core/encoder';
import { renderHexCodeRaster } from '../src/core/imageDecoder';
import { decodeRasterWasm } from './helpers/wasmDecoder';

const PAYLOAD = 'https://example.com/code';

describe('export dimensions', () => {
  it('decodes wide PNG exports', async () => {
    const code = encodeText(PAYLOAD, { formatVersion: 2, level: 8, ecLevel: 'M' });
    const raster = renderHexCodeRaster(code, { width: 512, height: 445 });
    expect(await decodeRasterWasm(raster)).toBe(PAYLOAD);
  });

  it('decodes square PNG exports', async () => {
    const code = encodeText(PAYLOAD, { formatVersion: 2, level: 8, ecLevel: 'M' });
    const raster = renderHexCodeRaster(code, { width: 512, height: 512 });
    expect(await decodeRasterWasm(raster)).toBe(PAYLOAD);
  });
});
