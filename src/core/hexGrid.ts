import type { AxialCoord, HexCell } from './types';

export const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

export const keyOf = ({ q, r }: AxialCoord): string => `${q},${r}`;

export const radiusForVersion = (version: number): number => version + 4;

export function generateAxialGrid(radius: number): AxialCoord[] {
  const cells: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r += 1) cells.push({ q, r });
  }
  return cells;
}

export function neighborCoords(coord: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

export function axialDistance(a: AxialCoord, b: AxialCoord = { q: 0, r: 0 }): number {
  const ac = -a.q - a.r;
  const bc = -b.q - b.r;
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(ac - bc));
}

/**
 * Flat-top axial-to-pixel conversion. The underlying addressing is axial, while
 * rendering appears as offset vertical columns because every other q column is
 * shifted by half a hex height in the projected pixel plane.
 */
export function axialToPixel({ q, r }: AxialCoord, size: number): { x: number; y: number } {
  return {
    x: size * 1.5 * q,
    y: size * Math.sqrt(3) * (r + q / 2)
  };
}

/** Circumradius for a rendered cell; matches axial flat-top center spacing. */
export function cellRenderRadius(size: number, cellScale = 1): number {
  return size * cellScale;
}

/** Stroke width that closes honeycomb gaps when cellScale < 1. */
export function gapClosingStroke(size: number, cellScale: number): number {
  if (cellScale >= 1) return 0;
  return size * (1 - cellScale) * 1.05;
}

export function polygonPoints(center: { x: number; y: number }, radius: number): string {
  return hexVertices(center, radius)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');
}

export function hexVertices(center: { x: number; y: number }, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  });
}

export interface AxisBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsForHexes(hexes: Array<{ center: { x: number; y: number }; radius: number }>): AxisBounds {
  const vertices = hexes.flatMap(({ center, radius }) => hexVertices(center, radius));
  return {
    minX: Math.min(...vertices.map((point) => point.x)),
    maxX: Math.max(...vertices.map((point) => point.x)),
    minY: Math.min(...vertices.map((point) => point.y)),
    maxY: Math.max(...vertices.map((point) => point.y))
  };
}

/** Quiet margin in cell widths — matches QR `margin: 1` in the comparison baseline. */
export const RENDER_QUIET_MARGIN_CELLS = 1;
/** Border stroke as a fraction of cell size — matches HexCodeCanvas. */
export const RENDER_BORDER_STROKE_FACTOR = 0.14;

export function viewBoxFromBounds(bounds: AxisBounds, margin: number): string {
  const minX = bounds.minX - margin;
  const minY = bounds.minY - margin;
  const width = bounds.maxX - bounds.minX + margin * 2;
  const height = bounds.maxY - bounds.minY + margin * 2;
  return `${minX} ${minY} ${width} ${height}`;
}

export function regularHexRadiusForBounds(
  hexes: Array<{ center: { x: number; y: number }; radius: number }>,
  padding: number
): number {
  const bounds = boundsForHexes(hexes);
  const maxAbsX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX)) + padding;
  const maxAbsY = Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY)) + padding;
  return Math.max(maxAbsX, maxAbsY / Math.sin(Math.PI / 3));
}

export interface ClusterOutlineCell extends AxialCoord {
  radius: number;
}

function pointKey(point: { x: number; y: number }, precision = 4): string {
  return `${point.x.toFixed(precision)},${point.y.toFixed(precision)}`;
}

function edgeKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const left = pointKey(a);
  const right = pointKey(b);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

/** Edge index facing an axial direction for pointy-top hex vertices (0° at +x). */
function edgeIndexForDirection(directionIndex: number): number {
  return (6 - directionIndex) % 6;
}

/** Collect outer edges where the axial neighbor is outside the cluster. */
export function clusterBoundaryEdges(
  cells: ClusterOutlineCell[],
  size: number
): Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> {
  const cellMap = new Map(cells.map((cell) => [keyOf(cell), cell]));
  const edges: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];

  for (const cell of cells) {
    const center = axialToPixel(cell, size);
    const vertices = hexVertices(center, cell.radius);
    for (let directionIndex = 0; directionIndex < AXIAL_DIRECTIONS.length; directionIndex += 1) {
      const direction = AXIAL_DIRECTIONS[directionIndex];
      const neighbor = { q: cell.q + direction.q, r: cell.r + direction.r };
      if (cellMap.has(keyOf(neighbor))) continue;
      const edgeIndex = edgeIndexForDirection(directionIndex);
      edges.push({ a: vertices[edgeIndex], b: vertices[(edgeIndex + 1) % 6] });
    }
  }

  return edges;
}

/** Chain boundary edges into one closed loop in SVG path form. */
export function clusterOutlinePath(cells: ClusterOutlineCell[], size: number): string {
  const edges = clusterBoundaryEdges(cells, size);
  if (edges.length === 0) return '';

  const adjacency = new Map<string, Array<{ x: number; y: number }>>();
  const unused = new Map<string, { a: { x: number; y: number }; b: { x: number; y: number } }>();

  for (const edge of edges) {
    unused.set(edgeKey(edge.a, edge.b), edge);
    for (const point of [edge.a, edge.b]) {
      const key = pointKey(point);
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key)!.push(point === edge.a ? edge.b : edge.a);
    }
  }

  const first = edges[0];
  const path: Array<{ x: number; y: number }> = [first.a, first.b];
  unused.delete(edgeKey(first.a, first.b));

  while (unused.size > 0) {
    const tip = path[path.length - 1];
    const previous = path[path.length - 2];
    const neighbors = adjacency.get(pointKey(tip)) ?? [];
    const next = neighbors.find(
      (candidate) =>
        pointKey(candidate) !== pointKey(previous) && unused.has(edgeKey(tip, candidate))
    );
    if (!next) break;
    path.push(next);
    unused.delete(edgeKey(tip, next));
  }

  const [start, ...rest] = path;
  return `M ${start.x} ${start.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
}

export interface RenderFootprint {
  width: number;
  height: number;
  area: number;
}

/** Bounding-box print area for the encoded cluster — matches HexCodeCanvas viewBox. */
export function hexRenderFootprint(
  cells: Array<Pick<HexCell, 'q' | 'r' | 'kind'>>,
  cellScale = 1,
  unitSize = 1
): RenderFootprint {
  const cellRadius = cellRenderRadius(unitSize, cellScale);
  const rendered = cells.map((cell) => ({
    center: axialToPixel(cell, unitSize),
    radius: cell.kind === 'finder' ? unitSize : cellRadius
  }));
  const bounds = boundsForHexes(rendered);
  const margin = unitSize * RENDER_QUIET_MARGIN_CELLS + unitSize * RENDER_BORDER_STROKE_FACTOR;
  const width = bounds.maxX - bounds.minX + margin * 2;
  const height = bounds.maxY - bounds.minY + margin * 2;
  return { width, height, area: width * height };
}

/** QR print area with the same quiet margin convention as hex rendering. */
export function qrRenderFootprint(modules: number, marginModules = RENDER_QUIET_MARGIN_CELLS): RenderFootprint {
  const side = modules + marginModules * 2;
  return { width: side, height: side, area: side * side };
}

export function dataSpiralOrder(cells: HexCell[]): HexCell[] {
  return [...cells]
    .filter((cell) => cell.kind === 'data')
    .sort((a, b) => axialDistance(a) - axialDistance(b) || a.q - b.q || a.r - b.r);
}

export { dataWavefrontOrder, ringTraversalIndex, shellForDistance, maxDataDistance, hexRingCoords } from './wavefront';
export type { ShellKind } from './wavefront';
