import type { CellLevel, DecodeResult, EncodedHexCode, HexCell, HexCodeStyle } from './types';
import { FORMAT_VERSION_V2, isModernFormat, type FormatVersion } from './types';
import { decodeHexCode, levelsToBytes } from './decoder';
import {
  axialToPixel,
  boundsForHexes,
  cellRenderRadius,
  hexVertices,
  RENDER_BORDER_STROKE_FACTOR,
  RENDER_QUIET_MARGIN_CELLS,
  viewBoxFromBounds
} from './hexGrid';
import { buildHl3BlankCells, buildHl3PatternMap, structuralHl3Value } from './hl3Patterns';
import { buildBlankCells, CENTER_LOGO_RADIUS } from './patterns';
import { colorFor, interpolateColor } from './hexPreview';
import { DEFAULT_STYLE } from '../themes/hexPresets';
import { readMetadataFromCells, parsePayloadLengthV3 } from './metaHl3';
import { unmaskValue } from './masking';
import { dataWavefrontOrder } from './wavefront';

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageDecodeOptions {
  renderSize?: number;
  style?: HexCodeStyle;
}

const DEFAULT_RENDER_SIZE = 10;
const LEVEL_CANDIDATES: CellLevel[] = [8, 4, 2];

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SampleAlign {
  offsetX: number;
  offsetY: number;
  xScale?: number;
  yScale?: number;
}

const LEGACY_EXPORT_ASPECT = 1.15;

interface GridCandidate {
  formatVersion: FormatVersion;
  radius: number;
  version: number;
  level: CellLevel;
  hasCenterLogo: boolean;
  renderSize: number;
  viewBox: ViewBox;
  score: number;
}

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.trim().replace('#', '');
  if (normalized.length === 3) {
    return [
      parseInt(normalized[0] + normalized[0], 16),
      parseInt(normalized[1] + normalized[1], 16),
      parseInt(normalized[2] + normalized[2], 16)
    ];
  }
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseColorToLuma(color: string): number {
  const [r, g, b] = parseHexColor(color);
  return luma(r, g, b);
}

function viewBoxForCells(
  cells: HexCell[],
  renderSize: number,
  style: HexCodeStyle,
  hasCenterLogo: boolean
): ViewBox {
  const cellRadius = cellRenderRadius(renderSize, style.cellScale);
  const finderRadius = renderSize;
  const logoRadius = renderSize * (CENTER_LOGO_RADIUS + 1.15);
  const rendered = [
    ...cells.map((cell) => ({
      center: axialToPixel(cell, renderSize),
      radius: cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius
    })),
    ...(hasCenterLogo ? [{ center: { x: 0, y: 0 }, radius: logoRadius }] : [])
  ];
  const bounds = boundsForHexes(rendered);
  const margin = renderSize * RENDER_QUIET_MARGIN_CELLS + renderSize * RENDER_BORDER_STROKE_FACTOR;
  const viewBox = viewBoxFromBounds(bounds, margin);
  const [minX, minY, width, height] = viewBox.split(' ').map(Number);
  return { minX, minY, width, height };
}

export const viewBoxForCodeCells = viewBoxForCells;

function svgToPixel(
  svgX: number,
  svgY: number,
  viewBox: ViewBox,
  imageWidth: number,
  imageHeight: number,
  align: SampleAlign = { offsetX: 0, offsetY: 0 }
): { x: number; y: number } {
  return {
    x: ((svgX - viewBox.minX) / viewBox.width) * imageWidth * (align.xScale ?? 1) + align.offsetX,
    y: ((svgY - viewBox.minY) / viewBox.height) * imageHeight * (align.yScale ?? 1) + align.offsetY
  };
}

function svgRadiusToPixel(
  radius: number,
  viewBox: ViewBox,
  imageWidth: number,
  imageHeight: number,
  align: SampleAlign = { offsetX: 0, offsetY: 0 }
): number {
  return (
    radius *
    Math.min(
      (imageWidth * (align.xScale ?? 1)) / viewBox.width,
      (imageHeight * (align.yScale ?? 1)) / viewBox.height
    )
  );
}

export function aspectFitAlign(imageWidth: number, imageHeight: number, viewBox: ViewBox): SampleAlign {
  const imageAspect = imageWidth / imageHeight;
  const viewAspect = viewBox.width / viewBox.height;
  if (imageAspect > viewAspect) {
    const fittedWidth = imageHeight * viewAspect;
    return {
      offsetX: (imageWidth - fittedWidth) / 2,
      offsetY: 0,
      xScale: fittedWidth / imageWidth,
      yScale: 1
    };
  }
  const fittedHeight = imageWidth / viewAspect;
  return {
    offsetX: 0,
    offsetY: (imageHeight - fittedHeight) / 2,
    xScale: 1,
    yScale: fittedHeight / imageHeight
  };
}

function usesLegacyExportAspect(imageWidth: number, imageHeight: number, viewBox: ViewBox): boolean {
  const imageAspect = imageWidth / imageHeight;
  const viewAspect = viewBox.width / viewBox.height;
  return Math.abs(imageAspect - LEGACY_EXPORT_ASPECT) < 0.04 && Math.abs(viewAspect - imageAspect) > 0.08;
}

function estimateBackgroundLuma(image: RasterImage): number {
  const points = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
    [Math.floor(image.width / 2), 0],
    [Math.floor(image.width / 2), image.height - 1]
  ] as const;
  const samples = points
    .map(([x, y]) => sampleLuma(image, x, y))
    .filter((value): value is number => value != null);
  return samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
}

export function detectContentBounds(image: RasterImage, threshold = 10): ContentBounds | undefined {
  const bg = estimateBackgroundLuma(image);
  let minX = image.width;
  let maxX = 0;
  let minY = image.height;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const value = sampleLuma(image, x, y);
      if (value == null || Math.abs(value - bg) <= threshold) continue;
      found = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) return undefined;
  return { minX, minY, maxX, maxY };
}

function sampleLuma(image: RasterImage, x: number, y: number): number | null {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return null;
  const index = (py * image.width + px) * 4;
  const r = image.data[index];
  const g = image.data[index + 1];
  const b = image.data[index + 2];
  const a = image.data[index + 3] / 255;

  const blendedR = r * a + 255 * (1 - a);
  const blendedG = g * a + 255 * (1 - a);
  const blendedB = b * a + 255 * (1 - a);

  return luma(blendedR, blendedG, blendedB);
}

function sampleHexLuma(
  image: RasterImage,
  centerX: number,
  centerY: number,
  radius: number,
  interiorOnly = true
): number {
  const samples: number[] = [];
  const maxRadius = interiorOnly ? radius * 0.55 : radius * 0.85;
  const step = Math.max(1, radius * 0.3);
  for (let dy = -maxRadius; dy <= maxRadius; dy += step) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += step) {
      if (Math.hypot(dx, dy) > maxRadius) continue;
      const value = sampleLuma(image, centerX + dx, centerY + dy);
      if (value != null) samples.push(value);
    }
  }
  if (samples.length === 0) return parseColorToLuma(DEFAULT_STYLE.lightColor);
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function pointInPolygon(x: number, y: number, vertices: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, rgb: [number, number, number]): void {
  if (x < 0 || y < 0) return;
  const index = (y * width + x) * 4;
  if (index < 0 || index + 3 >= data.length) return;
  data[index] = rgb[0];
  data[index + 1] = rgb[1];
  data[index + 2] = rgb[2];
  data[index + 3] = 255;
}

/** Deterministic raster reference used by tests and the image decode pipeline. */
export function renderHexCodeRaster(
  code: EncodedHexCode,
  options: ImageDecodeOptions & { width?: number; height?: number } = {}
): RasterImage {
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE;
  const style = { ...DEFAULT_STYLE, ...options.style };
  const viewBox = viewBoxForCells(code.cells, renderSize, style, code.hasCenterLogo);
  const width = options.width ?? Math.max(64, Math.round(viewBox.width * 8));
  const height = options.height ?? Math.max(64, Math.round(viewBox.height * 8));
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);

  const cellRadius = cellRenderRadius(renderSize, style.cellScale);
  const finderRadius = renderSize;

  for (const cell of code.cells) {
    const center = axialToPixel(cell, renderSize);
    const pixelCenter = svgToPixel(center.x, center.y, viewBox, width, height);
    const radius =
      ((cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius) / viewBox.width) * width;
    const fill = parseHexColor(colorFor(cell.value, code.level, style));
    const vertices = hexVertices(pixelCenter, radius);
    const minX = Math.max(0, Math.floor(Math.min(...vertices.map((v) => v.x))));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...vertices.map((v) => v.x))));
    const minY = Math.max(0, Math.floor(Math.min(...vertices.map((v) => v.y))));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...vertices.map((v) => v.y))));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pointInPolygon(x + 0.5, y + 0.5, vertices)) setPixel(data, width, x, y, fill);
      }
    }
  }

  const bg = parseHexColor(style.lightColor);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 255 && data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) {
      data[i] = bg[0];
      data[i + 1] = bg[1];
      data[i + 2] = bg[2];
    } else if (data[i + 3] === 0) {
      data[i] = bg[0];
      data[i + 1] = bg[1];
      data[i + 2] = bg[2];
      data[i + 3] = 255;
    }
  }

  return { width, height, data };
}

function buildTemplateCells(
  formatVersion: FormatVersion,
  radius: number,
  level: CellLevel,
  hasCenterLogo: boolean
): HexCell[] {
  if (isModernFormat(formatVersion)) {
    return buildHl3BlankCells(radius, level, { reserveCenterLogo: hasCenterLogo, formatVersion: FORMAT_VERSION_V2 });
  }
  return buildBlankCells(radius, level, { reserveCenterLogo: hasCenterLogo, formatVersion });
}

function structuralReferenceValue(cell: HexCell, formatVersion: FormatVersion, radius: number, level: CellLevel): number {
  if (isModernFormat(formatVersion) && cell.kind !== 'data' && cell.kind !== 'metadata' && cell.kind !== 'quiet') {
    const pattern = buildHl3PatternMap(radius);
    const calibrationKeys = buildHl3BlankCells(radius, level, { formatVersion: FORMAT_VERSION_V2 })
      .filter((entry) => entry.kind === 'calibration')
      .map((entry) => `${entry.q},${entry.r}`);
    const calibrationIndex = calibrationKeys.indexOf(`${cell.q},${cell.r}`);
    return structuralHl3Value(cell.kind, cell, level, radius, pattern, Math.max(0, calibrationIndex));
  }
  return cell.value;
}

function quantizeToLevel(lumaValue: number, minLuma: number, maxLuma: number, level: CellLevel): number {
  if (maxLuma <= minLuma) return 0;
  const t = (lumaValue - minLuma) / (maxLuma - minLuma);
  return Math.min(level - 1, Math.max(0, Math.round(t * (level - 1))));
}

function scoreStructuralMatch(
  image: RasterImage,
  cells: HexCell[],
  formatVersion: FormatVersion,
  radius: number,
  level: CellLevel,
  renderSize: number,
  style: HexCodeStyle,
  hasCenterLogo: boolean,
  align: SampleAlign = { offsetX: 0, offsetY: 0 }
): { score: number; viewBox: ViewBox } {
  const viewBox = viewBoxForCells(cells, renderSize, style, hasCenterLogo);
  const cellRadius = cellRenderRadius(renderSize, style.cellScale);
  const finderRadius = renderSize;
  const structural = cells.filter((cell) => cell.kind !== 'data' && cell.kind !== 'metadata' && cell.kind !== 'quiet');
  const lumas: number[] = [];
  let matches = 0;

  for (const cell of structural) {
    const center = axialToPixel(cell, renderSize);
    const pixel = svgToPixel(center.x, center.y, viewBox, image.width, image.height, align);
    const svgRadius = cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius;
    const pixelRadius = svgRadiusToPixel(svgRadius, viewBox, image.width, image.height, align);
    const sample = sampleHexLuma(image, pixel.x, pixel.y, pixelRadius, false);
    lumas.push(sample);
    const expected = structuralReferenceValue(cell, formatVersion, radius, level);
    const predicted = quantizeToLevel(sample, Math.min(...lumas), Math.max(...lumas), level);
    const expectedLuma =
      expected === 0
        ? parseColorToLuma(style.lightColor)
        : expected === level - 1
          ? parseColorToLuma(style.darkColor)
          : parseColorToLuma(interpolateColor(style.lightColor, style.darkColor, expected / (level - 1)));
    if (Math.abs(sample - expectedLuma) < 35 || predicted === expected) matches += 1;
  }

  return {
    score: structural.length > 0 ? matches / structural.length : 0,
    viewBox
  };
}

function enumerateCandidates(image: RasterImage, options: ImageDecodeOptions = {}): GridCandidate[] {
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE;
  const style = { ...DEFAULT_STYLE, ...options.style };
  const candidates: GridCandidate[] = [];

  const RADIUS_PRIORITY = [
    11, 10, 9, 8, 7, 6, 5, 4,
    12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
  ];

  for (const formatVersion of [FORMAT_VERSION_V2, 1] as const) {
    for (const radius of RADIUS_PRIORITY) {
      for (const hasCenterLogo of [false, true]) {
        const levels = formatVersion === FORMAT_VERSION_V2 ? [8 as const] : LEVEL_CANDIDATES;
        for (const level of levels) {
          const cells = buildTemplateCells(formatVersion, radius, level, hasCenterLogo);
          const stretch = scoreStructuralMatch(
            image,
            cells,
            formatVersion,
            radius,
            level,
            renderSize,
            style,
            hasCenterLogo
          );
          const fit = scoreStructuralMatch(
            image,
            cells,
            formatVersion,
            radius,
            level,
            renderSize,
            style,
            hasCenterLogo,
            aspectFitAlign(image.width, image.height, stretch.viewBox)
          );
          const { score, viewBox } = fit.score > stretch.score ? fit : stretch;
          candidates.push({
            formatVersion,
            radius,
            version: radius - 4,
            level,
            hasCenterLogo,
            renderSize,
            viewBox,
            score
          });
        }
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || b.formatVersion - a.formatVersion);
}

function buildCalibratedPalette(
  anchors: Array<{ value: number; luma: number }>,
  level: CellLevel,
  style: HexCodeStyle
): Array<{ value: number; luma: number }> {
  if (anchors.length < 2) {
    return Array.from({ length: level }, (_, value) => ({
      value,
      luma: parseColorToLuma(colorFor(value, level, style))
    }));
  }

  const sorted = [...anchors].sort((a, b) => a.value - b.value);
  return Array.from({ length: level }, (_, value) => {
    if (value <= sorted[0].value) return { value, luma: sorted[0].luma };
    if (value >= sorted[sorted.length - 1].value) return { value, luma: sorted[sorted.length - 1].luma };
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const left = sorted[index];
      const right = sorted[index + 1];
      if (value < left.value || value > right.value) continue;
      if (left.value === right.value) return { value, luma: left.luma };
      const t = (value - left.value) / (right.value - left.value);
      return { value, luma: left.luma + t * (right.luma - left.luma) };
    }
    return { value, luma: parseColorToLuma(colorFor(value, level, style)) };
  });
}

function quantizeWithPalette(
  sample: number,
  level: CellLevel,
  style: HexCodeStyle,
  anchors?: Array<{ value: number; luma: number }>
): number {
  const palette = buildCalibratedPalette(anchors ?? [], level, style);

  let bestValue = 0;
  let bestDistance = Infinity;
  for (const entry of palette) {
    const distance = Math.abs(sample - entry.luma);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = entry.value;
    }
  }
  return bestValue;
}

function cellSampleLuma(
  image: RasterImage,
  cell: HexCell,
  candidate: GridCandidate,
  style: HexCodeStyle,
  align: SampleAlign
): number {
  const cellRadius = cellRenderRadius(candidate.renderSize, style.cellScale);
  const finderRadius = candidate.renderSize;
  const center = axialToPixel(cell, candidate.renderSize);
  const pixel = svgToPixel(center.x, center.y, candidate.viewBox, image.width, image.height, align);
  const svgRadius = cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius;
  const pixelRadius = svgRadiusToPixel(svgRadius, candidate.viewBox, image.width, image.height, align);
  if (cell.kind === 'metadata') {
    return sampleLuma(image, pixel.x, pixel.y) ?? sampleHexLuma(image, pixel.x, pixel.y, pixelRadius);
  }
  return sampleHexLuma(image, pixel.x, pixel.y, pixelRadius, false);
}

function alignmentScore(
  image: RasterImage,
  templateCells: HexCell[],
  candidate: GridCandidate,
  style: HexCodeStyle,
  align: SampleAlign
): number {
  const anchors: Array<{ value: number; luma: number }> = [];
  let matches = 0;
  let total = 0;

  for (const cell of templateCells) {
    if (cell.kind === 'quiet') continue;
    const sample = cellSampleLuma(image, cell, candidate, style, align);
    if (cell.kind === 'calibration') {
      const expected = structuralReferenceValue(cell, candidate.formatVersion, candidate.radius, candidate.level);
      anchors.push({ value: expected, luma: sample });
    }
    if (cell.kind === 'data' || cell.kind === 'metadata') continue;
    total += 1;
    const expected = structuralReferenceValue(cell, candidate.formatVersion, candidate.radius, candidate.level);
    const predicted = quantizeWithPalette(
      sample,
      candidate.level,
      style,
      anchors.length >= 2 ? anchors : undefined
    );
    if (predicted === expected) matches += 1;
  }

  return total > 0 ? matches / total : 0;
}

export function findBestSampleAlign(
  image: RasterImage,
  templateCells: HexCell[],
  candidate: GridCandidate,
  style: HexCodeStyle,
  baseAlign: SampleAlign = { offsetX: 0, offsetY: 0, xScale: 1, yScale: 1 }
): SampleAlign {
  const baseline = alignmentScore(image, templateCells, candidate, style, baseAlign);
  let best: SampleAlign = baseAlign;
  let bestScore = baseline;
  const span = image.width >= 900 ? 8 : 6;
  const yScales = usesLegacyExportAspect(image.width, image.height, candidate.viewBox)
    ? [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06]
    : [1];

  for (const yScale of yScales) {
    for (let offsetY = -span; offsetY <= span; offsetY += 1) {
      for (let offsetX = -span; offsetX <= span; offsetX += 1) {
        const align = {
          offsetX: baseAlign.offsetX + offsetX,
          offsetY: baseAlign.offsetY + offsetY,
          xScale: baseAlign.xScale ?? 1,
          yScale: (baseAlign.yScale ?? 1) * yScale
        };
        const score = alignmentScore(image, templateCells, candidate, style, align);
        if (score > bestScore) {
          bestScore = score;
          best = align;
        }
      }
    }
  }

  if (bestScore >= 0.88) return best;
  return baseAlign;
}

export function sampleCellsFromImage(
  image: RasterImage,
  templateCells: HexCell[],
  candidate: GridCandidate,
  style: HexCodeStyle,
  align: SampleAlign = { offsetX: 0, offsetY: 0 },
  useCalibration = false
): HexCell[] {
  const cellRadius = cellRenderRadius(candidate.renderSize, style.cellScale);
  const finderRadius = candidate.renderSize;
  const calibrationAnchors: Array<{ value: number; luma: number }> = [];

  if (useCalibration) {
    for (const cell of templateCells) {
      if (cell.kind !== 'calibration') continue;
      const center = axialToPixel(cell, candidate.renderSize);
      const pixel = svgToPixel(center.x, center.y, candidate.viewBox, image.width, image.height, align);
      const pixelRadius = svgRadiusToPixel(cellRadius, candidate.viewBox, image.width, image.height, align);
      calibrationAnchors.push({
        value: structuralReferenceValue(cell, candidate.formatVersion, candidate.radius, candidate.level),
        luma: sampleHexLuma(image, pixel.x, pixel.y, pixelRadius, false)
      });
    }
  }

  return templateCells.map((cell) => {
    const center = axialToPixel(cell, candidate.renderSize);
    const pixel = svgToPixel(center.x, center.y, candidate.viewBox, image.width, image.height, align);
    const svgRadius = cell.kind === 'finder' || cell.kind === 'fiducial' ? finderRadius : cellRadius;
    const pixelRadius = svgRadiusToPixel(svgRadius, candidate.viewBox, image.width, image.height, align);
    const sample =
      cell.kind === 'metadata'
        ? (sampleLuma(image, pixel.x, pixel.y) ?? sampleHexLuma(image, pixel.x, pixel.y, pixelRadius, false))
        : sampleHexLuma(image, pixel.x, pixel.y, pixelRadius, false);

    if (cell.kind === 'data' || cell.kind === 'metadata') {
      const anchors = useCalibration && calibrationAnchors.length >= 2 ? calibrationAnchors : undefined;
      const value = quantizeWithPalette(sample, candidate.level, style, anchors);
      const expectedLuma = buildCalibratedPalette(anchors ?? [], candidate.level, style).find(
        (entry) => entry.value === value
      )?.luma ?? parseColorToLuma(colorFor(value, candidate.level, style));
      const light = parseColorToLuma(style.lightColor);
      const dark = parseColorToLuma(style.darkColor);
      const span = Math.max(1, dark - light);
      const fit = Math.abs(sample - expectedLuma) / span;
      const confidence = Math.max(0.92, 1 - fit);
      return { ...cell, value, confidence };
    }

    const expected = structuralReferenceValue(cell, candidate.formatVersion, candidate.radius, candidate.level);
    return { ...cell, value: expected, confidence: 0.98 };
  });
}

function enrichFromMetadata(
  cells: HexCell[],
  candidate: GridCandidate
): Required<Pick<EncodedHexCode, 'cells' | 'level' | 'maskId' | 'ecLevel' | 'formatVersion' | 'version' | 'radius' | 'hasCenterLogo'>> {
  if (isModernFormat(candidate.formatVersion)) {
    const metadata = readMetadataFromCells(cells);
    return {
      cells,
      level: candidate.level,
      maskId: metadata.maskId,
      ecLevel: metadata.ecLevel,
      formatVersion: FORMAT_VERSION_V2,
      version: metadata.version || candidate.version,
      radius: candidate.radius,
      hasCenterLogo: candidate.hasCenterLogo
    };
  }

  return {
    cells,
    level: candidate.level,
    maskId: 0,
    ecLevel: 'M',
    formatVersion: candidate.formatVersion,
    version: candidate.version,
    radius: candidate.radius,
    hasCenterLogo: candidate.hasCenterLogo
  };
}

function payloadBytesFromSampled(
  sampled: HexCell[],
  candidate: GridCandidate,
  maskId: number
): Uint8Array {
  const dataCells = dataWavefrontOrder(sampled.filter((cell) => cell.kind === 'data'));
  return levelsToBytes(
    dataCells.map((cell) => unmaskValue(cell.value, cell, candidate.level, maskId)),
    candidate.level
  );
}

function isConsistentV3Decode(
  sampled: HexCell[],
  result: DecodeResult,
  maskId: number,
  level: CellLevel
): boolean {
  const metadata = readMetadataFromCells(sampled);
  const bytes = payloadBytesFromSampled(
    sampled,
    { formatVersion: FORMAT_VERSION_V2, level } as GridCandidate,
    maskId
  );
  const streamLength = parsePayloadLengthV3(bytes);
  if (streamLength !== result.text.length || streamLength <= 0) return false;
  if (metadata.payloadLength >= 8 && metadata.payloadLength !== streamLength) return false;
  if (result.text.length <= 3) return false;
  return true;
}

function scoreDecodedCandidate(result: DecodeResult, payloadLength: number): number {
  let score = result.confidence * 100;
  score += Math.min(result.text.length, 160) * 2;
  if (payloadLength > 0) {
    if (result.text.length === payloadLength) score += 250;
    else score -= Math.abs(result.text.length - payloadLength) * 80;
  }
  if (/^[\x09\x0a\x0d\x20-\x7e]*$/u.test(result.text)) score += 40;
  if (result.text.length <= 2) score -= 200;
  if (result.text.length === 0) score -= 500;
  return score;
}

function isPlausibleImageText(text: string): boolean {
  if (text.length < 4) return false;
  if (text.includes('\uFFFD')) return false;
  return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text);
}

export function tryDecodeSampledCells(sampled: HexCell[], candidate: GridCandidate) {
  const encoded = enrichFromMetadata(sampled, candidate);

  if (isModernFormat(candidate.formatVersion)) {
    const metadata = readMetadataFromCells(sampled);
    const maskIds = [...new Set([encoded.maskId, 0, 1, 2, 3])];
    const ecLevels = [...new Set<typeof encoded.ecLevel>([metadata.ecLevel, encoded.ecLevel, 'L', 'M', 'Q', 'H'])];
    const attempts: DecodeResult[] = [];
    let lastError: Error | null = null;

    for (const maskId of maskIds) {
      for (const ecLevel of ecLevels) {
        try {
          const result = decodeHexCode({ ...encoded, maskId, ecLevel });
          if (!isPlausibleImageText(result.text)) continue;
          if (!isConsistentV3Decode(sampled, result, maskId, candidate.level)) {
            continue;
          }
          attempts.push(result);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Decode failed');
        }
      }
    }

    if (attempts.length > 0) {
      const payloadLength = metadata?.payloadLength ?? attempts[0].text.length;
      return attempts.sort(
        (a, b) => scoreDecodedCandidate(b, payloadLength) - scoreDecodedCandidate(a, payloadLength)
      )[0];
    }

    if (lastError) throw lastError;
  }

  return decodeHexCode(encoded);
}

export function decodeHexImageWithReference(
  image: RasterImage,
  reference: EncodedHexCode,
  options: ImageDecodeOptions = {}
) {
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE;
  const style = { ...DEFAULT_STYLE, ...options.style };
  const candidate: GridCandidate = {
    formatVersion: reference.formatVersion,
    radius: reference.radius,
    version: reference.version,
    level: reference.level,
    hasCenterLogo: reference.hasCenterLogo,
    renderSize,
    viewBox: viewBoxForCells(reference.cells, renderSize, style, reference.hasCenterLogo),
    score: 1
  };
  const template = reference.cells.map((cell) => ({ ...cell, value: 0, confidence: 0.5 }));
  const align = findBestSampleAlign(image, template, candidate, style);
  const sampled = sampleCellsFromImage(image, template, candidate, style, align, true);
  return tryDecodeSampledCells(sampled, candidate);
}

function decodeHexImagePass(
  image: RasterImage,
  options: ImageDecodeOptions,
  refine: boolean
): { result: DecodeResult; score: number } | null {
  const style = { ...DEFAULT_STYLE, ...options.style };
  const candidates = enumerateCandidates(image, options);
  const attempts: Array<{ result: DecodeResult; score: number }> = [];
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    if (candidate.score < 0.35) continue;
    try {
      const template = buildTemplateCells(
        candidate.formatVersion,
        candidate.radius,
        candidate.level,
        candidate.hasCenterLogo
      );
      const fitAlign = aspectFitAlign(image.width, image.height, candidate.viewBox);
      const stretchAlign = { offsetX: 0, offsetY: 0, xScale: 1, yScale: 1 };
      const baseAlign =
        alignmentScore(image, template, candidate, style, fitAlign) >
        alignmentScore(image, template, candidate, style, stretchAlign)
          ? fitAlign
          : stretchAlign;
      const align = refine ? findBestSampleAlign(image, template, candidate, style, baseAlign) : baseAlign;
      const useCalibration = refine && isModernFormat(candidate.formatVersion);
      const sampled = sampleCellsFromImage(image, template, candidate, style, align, useCalibration);
      const result = tryDecodeSampledCells(sampled, candidate);
      if (!isPlausibleImageText(result.text)) continue;
      const metadata = isModernFormat(candidate.formatVersion) ? readMetadataFromCells(sampled) : null;
      attempts.push({
        result,
        score:
          scoreDecodedCandidate(result, metadata?.payloadLength ?? result.text.length) +
          candidate.score * 10 +
          candidate.formatVersion * 5
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Decode failed');
    }
  }

  if (attempts.length > 0) {
    return attempts.sort((a, b) => b.score - a.score)[0];
  }

  if (lastError) throw lastError;
  return null;
}

export function decodeHexImage(image: RasterImage, options: ImageDecodeOptions = {}) {
  const passes: Array<{ result: DecodeResult; score: number }> = [];
  for (const refine of [false, true]) {
    try {
      const res = decodeHexImagePass(image, options, refine);
      if (res) passes.push(res);
    } catch (e) {
      // ignore pass errors to allow other passes to run
    }
  }

  if (passes.length === 0) {
    throw new Error('Could not decode HexLattice symbol from image');
  }

  return passes.sort((a, b) => b.score - a.score)[0].result;
}

export function rasterFromImageData(imageData: ImageData): RasterImage {
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}
