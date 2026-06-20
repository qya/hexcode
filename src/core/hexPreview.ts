import type { EncodedHexCode, HexCodeStyle } from './types';
import {
  axialToPixel,
  boundsForHexes,
  cellRenderRadius,
  clusterOutlinePath,
  gapClosingStroke,
  polygonPoints,
  RENDER_QUIET_MARGIN_CELLS,
  viewBoxFromBounds
} from './hexGrid';
import { CENTER_LOGO_RADIUS } from './patterns';
import { DEFAULT_STYLE } from '../themes/hexPresets';

export interface HexPreviewOptions {
  size?: number;
  centerLogo?: string;
  customStyle?: Partial<HexCodeStyle>;
  width?: number;
}

export function interpolateColor(color1: string, color2: string, factor: number): string {
  const parse = (c: string): [number, number, number] => {
    const hex = c.trim().replace('#', '');
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
    return [0, 0, 0];
  };

  const [r1, g1, b1] = parse(color1);
  const [r2, g2, b2] = parse(color2);
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function colorFor(value: number, level: number, style: HexCodeStyle): string {
  if (value === 0) return style.lightColor;
  if (value === level - 1) return style.darkColor;
  return interpolateColor(style.lightColor, style.darkColor, value / (level - 1));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildHexCodeSvgMarkup(code: EncodedHexCode, options: HexPreviewOptions = {}): string {
  const size = options.size ?? 10;
  const style: HexCodeStyle = { ...DEFAULT_STYLE, ...options.customStyle };
  const centerLogo = options.centerLogo ?? 'HX';

  const cellRadius = cellRenderRadius(size, style.cellScale);
  const finderRadius = size;
  const logoRadius = size * (CENTER_LOGO_RADIUS + 1.15);
  const gapStroke = gapClosingStroke(size, style.cellScale);
  const points = code.cells.map((cell) => ({ cell, center: axialToPixel(cell, size) }));
  const renderedHexes = [
    ...points.map(({ cell, center }) => ({
      center,
      radius: cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius
    })),
    ...(code.hasCenterLogo ? [{ center: { x: 0, y: 0 }, radius: logoRadius }] : [])
  ];
  const clusterBounds = boundsForHexes(renderedHexes);
  const quietMargin = size * RENDER_QUIET_MARGIN_CELLS;
  const borderStroke = size * 0.14;
  const outlinePath = clusterOutlinePath(
    points.map(({ cell }) => ({
      q: cell.q,
      r: cell.r,
      radius: cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius
    })),
    size
  );
  const viewBox = viewBoxFromBounds(clusterBounds, quietMargin + borderStroke);
  const logoHex = polygonPoints({ x: 0, y: 0 }, logoRadius);

  const polygons = points
    .map(({ cell, center }) => {
      const fill = colorFor(cell.value, code.level, style);
      const radius = cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius;
      const stroke = gapStroke > 0 ? ` stroke="${fill}" stroke-width="${gapStroke}" stroke-linejoin="round"` : '';
      return `<polygon points="${polygonPoints(center, radius)}" fill="${fill}"${stroke}/>`;
    })
    .join('');

  const outline = outlinePath
    ? `<path d="${outlinePath}" fill="none" stroke="${style.frameOuterColor}" stroke-width="${borderStroke}" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';

  const logo =
    code.hasCenterLogo
      ? `<g aria-label="Center logo slot"><polygon points="${logoHex}" fill="${style.logoBgColor}" stroke="${style.logoBorderColor}" stroke-width="2.5" stroke-linejoin="round"/>${
          centerLogo.trim()
            ? `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${style.logoTextColor}" font-weight="900" font-size="14" letter-spacing="0.04em" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${escapeXml(centerLogo.trim().slice(0, 4))}</text>`
            : ''
        }</g>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Generated ⬡code">${polygons}${outline}${logo}</svg>`;
}

export async function hexCodeToPngDataUrl(
  code: EncodedHexCode,
  options: HexPreviewOptions = {}
): Promise<string> {
  const width = options.width ?? 120;
  const style: HexCodeStyle = { ...DEFAULT_STYLE, ...options.customStyle };
  const svg = buildHexCodeSvgMarkup(code, options);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const aspect = img.height / Math.max(img.width, 1);
        canvas.width = width;
        canvas.height = Math.max(1, Math.round(width * aspect));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.fillStyle = style.lightColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to rasterize HexCode preview'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
