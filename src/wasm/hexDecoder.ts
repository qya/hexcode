import type { RasterImage } from '../core/imageDecoder';

type WasmModule = {
  default: () => Promise<unknown>;
  decode_hex_rgba: (data: Uint8ClampedArray, width: number, height: number) => WasmDecodeResult;
  decode_hl3_rgba: (data: Uint8ClampedArray, width: number, height: number) => string;
};

type WasmDecodeResult = {
  text: string;
  format_version: number;
};

export interface WasmImageDecodeResult {
  text: string;
  formatVersion: number;
}

let wasmModulePromise: Promise<WasmModule | null> | null = null;

async function loadWasmModule(): Promise<WasmModule | null> {
  wasmModulePromise ??= import('./hexqr_decoder/hexqr_decoder.js')
    .then(async (mod) => {
      const wasm = mod as unknown as WasmModule;
      await wasm.default();
      return wasm;
    })
    .catch(() => null);
  return wasmModulePromise;
}

export async function decodeHexImageWasm(image: RasterImage): Promise<WasmImageDecodeResult | null> {
  const wasm = await loadWasmModule();
  if (!wasm) return null;
  try {
    const result = wasm.decode_hex_rgba(image.data, image.width, image.height);
    return { text: result.text, formatVersion: result.format_version };
  } catch {
    return null;
  }
}
