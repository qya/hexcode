import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RasterImage } from '../../src/core/imageDecoder';

const WASM_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/wasm/hexqr_decoder');

type WasmDecoderModule = {
  default: (input?: Buffer | Uint8Array) => Promise<unknown>;
  initSync: (input?: Buffer | Uint8Array) => unknown;
  decode_hex_rgba: (data: Uint8ClampedArray, width: number, height: number) => {
    text: string;
    format_version: number;
  };
  decode_hl3_rgba: (data: Uint8ClampedArray, width: number, height: number) => string;
};

let modulePromise: Promise<WasmDecoderModule> | null = null;

async function loadModule(): Promise<WasmDecoderModule> {
  modulePromise ??= import('../../src/wasm/hexqr_decoder/hexqr_decoder.js').then(async (mod) => {
    const wasm = mod as unknown as WasmDecoderModule;
    const bytes = readFileSync(join(WASM_DIR, 'hexqr_decoder_bg.wasm'));
    if (typeof wasm.initSync === 'function') {
      wasm.initSync(bytes);
    } else {
      await wasm.default(bytes);
    }
    return wasm;
  });
  return modulePromise;
}

export async function decodeRasterWasm(image: RasterImage): Promise<string> {
  const wasm = await loadModule();
  return wasm.decode_hex_rgba(image.data, image.width, image.height).text;
}

export async function decodeRasterWasmWithMeta(
  image: RasterImage
): Promise<{ text: string; formatVersion: number }> {
  const wasm = await loadModule();
  const result = wasm.decode_hex_rgba(image.data, image.width, image.height);
  return { text: result.text, formatVersion: result.format_version };
}
