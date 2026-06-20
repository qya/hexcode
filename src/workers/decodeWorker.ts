import { loadRasterFromBuffer } from '../core/rasterLoader';
import { decodeHexImage } from '../core/imageDecoder';
import type { DecodeResult, EncodedHexCode } from '../core/types';
import { decodeHexCode } from '../core/decoder';
import { decodeHexImageWasm } from '../wasm/hexDecoder';

type WorkerRequest = {
  kind: 'file';
  buffer: ArrayBuffer;
  mimeType?: string;
  fileName?: string;
};

type WorkerResponse = (DecodeResult & { decoder?: string }) | { error: string };

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function invertRaster(raster: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(raster.data.length);
  for (let i = 0; i < raster.data.length; i += 4) {
    data[i] = 255 - raster.data[i];
    data[i + 1] = 255 - raster.data[i + 1];
    data[i + 2] = 255 - raster.data[i + 2];
    data[i + 3] = raster.data[i + 3];
  }
  return { width: raster.width, height: raster.height, data };
}

function normalizeLumaContrast(raster: RasterImage): RasterImage {
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < raster.data.length; i += 4) {
    const l = luma(raster.data[i], raster.data[i + 1], raster.data[i + 2]);
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  if (maxL - minL < 10) return raster;

  const data = new Uint8ClampedArray(raster.data.length);
  const factor = 255 / (maxL - minL);
  for (let i = 0; i < raster.data.length; i += 4) {
    const r = raster.data[i];
    const g = raster.data[i + 1];
    const b = raster.data[i + 2];
    data[i] = Math.min(255, Math.max(0, (r - minL) * factor));
    data[i + 1] = Math.min(255, Math.max(0, (g - minL) * factor));
    data[i + 2] = Math.min(255, Math.max(0, (b - minL) * factor));
    data[i + 3] = raster.data[i + 3];
  }
  return { width: raster.width, height: raster.height, data };
}

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { buffer, mimeType, fileName } = event.data;
  const name = fileName?.toLowerCase() ?? '';
  const isJson = mimeType === 'application/json' || name.endsWith('.json');

  const postLog = (level: 'info' | 'success' | 'error', message: string) => {
    self.postMessage({ kind: 'log', level, message } as any);
  };

  try {
    if (isJson) {
      const text = new TextDecoder().decode(buffer);
      const maybeCode = JSON.parse(text) as EncodedHexCode;
      self.postMessage({ ...decodeHexCode(maybeCode), decoder: 'object' } satisfies WorkerResponse);
      return;
    }

    // Try standard decode with white background first (since loadRasterFromBuffer defaults to white)
    postLog('info', 'Running standard decoder (light background)...');
    let raster = await loadRasterFromBuffer(buffer, { mimeType, fileName, backgroundColor: 'white' });
    
    // 1. Standard WASM
    let wasmResult = await decodeHexImageWasm(raster);
    if (wasmResult) {
      self.postMessage({
        text: wasmResult.text,
        correctedCells: 0,
        confidence: 1,
        formatVersion: wasmResult.formatVersion as any,
        decoder: 'wasm'
      } satisfies WorkerResponse);
      return;
    }

    // 2. Standard JS
    try {
      const jsResult = decodeHexImage(raster);
      self.postMessage({ ...jsResult, decoder: 'js' } satisfies WorkerResponse);
      return;
    } catch {
      // ignore and move to next strategy
    }

    // 3. Try Inversion
    postLog('info', 'Auto-detecting: trying inverted color mode...');
    const invertedRaster = invertRaster(raster);
    wasmResult = await decodeHexImageWasm(invertedRaster);
    if (wasmResult) {
      self.postMessage({
        text: wasmResult.text,
        correctedCells: 0,
        confidence: 1,
        formatVersion: wasmResult.formatVersion as any,
        decoder: 'wasm (inverted)'
      } satisfies WorkerResponse);
      return;
    }

    try {
      const jsResult = decodeHexImage(invertedRaster);
      self.postMessage({ ...jsResult, decoder: 'js (inverted)' } satisfies WorkerResponse);
      return;
    } catch {
      // ignore
    }

    // 4. Try black background toggle (for transparent images that might need dark background)
    postLog('info', 'Auto-detecting: trying dark background mode...');
    const darkRaster = await loadRasterFromBuffer(buffer, { mimeType, fileName, backgroundColor: 'black' });
    wasmResult = await decodeHexImageWasm(darkRaster);
    if (wasmResult) {
      self.postMessage({
        text: wasmResult.text,
        correctedCells: 0,
        confidence: 1,
        formatVersion: wasmResult.formatVersion as any,
        decoder: 'wasm (dark bg)'
      } satisfies WorkerResponse);
      return;
    }

    try {
      const jsResult = decodeHexImage(darkRaster);
      self.postMessage({ ...jsResult, decoder: 'js (dark bg)' } satisfies WorkerResponse);
      return;
    } catch {
      // ignore
    }

    // 5. Try high contrast enhancement
    postLog('info', 'Auto-detecting: trying contrast enhancement...');
    const highContrastRaster = normalizeLumaContrast(raster);
    wasmResult = await decodeHexImageWasm(highContrastRaster);
    if (wasmResult) {
      self.postMessage({
        text: wasmResult.text,
        correctedCells: 0,
        confidence: 1,
        formatVersion: wasmResult.formatVersion as any,
        decoder: 'wasm (high contrast)'
      } satisfies WorkerResponse);
      return;
    }

    try {
      const jsResult = decodeHexImage(highContrastRaster);
      self.postMessage({ ...jsResult, decoder: 'js (high contrast)' } satisfies WorkerResponse);
      return;
    } catch {
      // ignore
    }

    self.postMessage({ error: 'Could not decode HexLattice symbol from image even with auto-detect recovery modes.' } satisfies WorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decode ⬡code image';
    self.postMessage({ error: message } satisfies WorkerResponse);
  }
};
