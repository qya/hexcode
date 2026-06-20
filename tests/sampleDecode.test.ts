import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import type { RasterImage } from '../src/core/imageDecoder';
import { decodeRasterWasm } from './helpers/wasmDecoder';

const SAMPLE_DIR = join(process.cwd(), 'sample');
const EXPECTED_PAYLOAD = 'https://example.com/hexcode';

function loadPngRaster(filePath: string): RasterImage {
  const png = PNG.sync.read(readFileSync(filePath));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data.buffer) };
}

describe('sample PNG fixtures', () => {
  const files = readdirSync(SAMPLE_DIR).filter((name) => name.endsWith('.png'));

  it('has sample exports to test against', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    if (file.includes('withlogo')) continue;
    it(`decodes ${file} via WASM`, async () => {
      const text = await decodeRasterWasm(loadPngRaster(join(SAMPLE_DIR, file)));
      const expected = file.includes('superlong')
        ? 'https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        : file.includes('long')
          ? 'facebook.com/groups/570312833456938/?multi_permalinks=2501765563644979&hoisted_section_header_type=recently_seen&__cft__[0]=AZYHD6b7L4ynMbjgZhJLBkiTZntlvqJ8X1ClNyRIzYpQK1x0LHWj-raIphJywJHk_FXubqzRIgG87oV4mmeTakH7Gp95Z5kOfuLQV0TYbFlXKjumpO1YJGTy3wc_ngGXJIk4m3iBx7_oomvOoNI-n9lK&__tn__=%2CO%2CP-R'
          : EXPECTED_PAYLOAD;
      expect(text).toBe(expected);
    }, 30_000);
  }
});
