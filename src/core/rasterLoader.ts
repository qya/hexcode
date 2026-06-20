import type { RasterImage } from './imageDecoder';

const DEFAULT_RASTER_WIDTH = 512;

export interface RasterLoadOptions {
  fileName?: string;
  mimeType?: string;
  backgroundColor?: 'white' | 'black' | 'transparent';
}

/** Infer pixel size for SVG markup that only declares viewBox (HexCode SVG exports). */
export function parseSvgRasterSize(svg: string, targetWidth = DEFAULT_RASTER_WIDTH): { width: number; height: number } {
  const widthMatch = svg.match(/\bwidth="([\d.]+)/i);
  const heightMatch = svg.match(/\bheight="([\d.]+)/i);
  if (widthMatch && heightMatch) {
    const width = Math.max(1, Math.ceil(Number(widthMatch[1])));
    const height = Math.max(1, Math.ceil(Number(heightMatch[1])));
    return { width, height };
  }

  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const width = Math.max(1, Math.round(targetWidth));
      const height = Math.max(1, Math.round((targetWidth * parts[3]) / parts[2]));
      return { width, height };
    }
  }

  return { width: targetWidth, height: targetWidth };
}

export function isSvgPayload(mimeType: string | undefined, fileName: string | undefined, buffer: ArrayBuffer): boolean {
  const name = fileName?.toLowerCase() ?? '';
  if (mimeType?.includes('svg') || name.endsWith('.svg')) return true;
  const head = new TextDecoder().decode(buffer.slice(0, 256)).trimStart();
  return head.startsWith('<svg') || head.startsWith('<?xml');
}

function normalizeSvgBlob(buffer: ArrayBuffer, width: number, height: number): Blob {
  const text = new TextDecoder().decode(buffer);
  const withSize = /\bwidth="/i.test(text)
    ? text
    : text.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  return new Blob([withSize], { type: 'image/svg+xml;charset=utf-8' });
}

async function bitmapFromBlob(blob: Blob, resize?: { width: number; height: number }): Promise<ImageBitmap> {
  if (resize) {
    return createImageBitmap(blob, {
      resizeWidth: resize.width,
      resizeHeight: resize.height,
      resizeQuality: 'high'
    });
  }
  return createImageBitmap(blob);
}

export async function loadRasterFromBuffer(
  buffer: ArrayBuffer,
  options: RasterLoadOptions = {}
): Promise<RasterImage> {
  const mimeType = options.mimeType ?? 'application/octet-stream';
  let blob = new Blob([buffer], { type: mimeType });
  let bitmap = await bitmapFromBlob(blob);

  if ((bitmap.width <= 0 || bitmap.height <= 0) && isSvgPayload(mimeType, options.fileName, buffer)) {
    bitmap.close();
    const size = parseSvgRasterSize(new TextDecoder().decode(buffer));
    blob = normalizeSvgBlob(buffer, size.width, size.height);
    bitmap = await bitmapFromBlob(blob, size);
  }

  const width = bitmap.width;
  const height = bitmap.height;
  if (width <= 0 || height <= 0) {
    bitmap.close();
    throw new Error(
      'Image has no readable dimensions. Export as PNG or JPG from the generator, or use an SVG with width and height.'
    );
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas rendering is unavailable in this browser');
  }

  const bg = options.backgroundColor ?? 'white';
  if (bg === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  } else if (bg === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, width, height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}
