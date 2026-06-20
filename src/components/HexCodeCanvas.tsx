import { memo, useMemo } from 'react';
import type { EncodedHexCode, HexCodeStyle } from '../core/types';
import {
  axialToPixel,
  boundsForHexes,
  cellRenderRadius,
  clusterOutlinePath,
  gapClosingStroke,
  polygonPoints,
  RENDER_QUIET_MARGIN_CELLS,
  viewBoxFromBounds
} from '../core/hexGrid';
import { CENTER_LOGO_RADIUS } from '../core/patterns';
import { DEFAULT_STYLE } from '../themes/hexPresets';

export { DEFAULT_STYLE };

interface Props {
  code: EncodedHexCode;
  size?: number;
  centerLogo?: string;
  customStyle?: Partial<HexCodeStyle>;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export const HexCodeCanvas = memo(function HexCodeCanvas({
  code,
  size = 10,
  centerLogo = 'HX',
  customStyle,
  svgRef
}: Props) {
  const style = useMemo((): HexCodeStyle => ({ ...DEFAULT_STYLE, ...customStyle }), [customStyle]);

  const geometry = useMemo(() => {
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
    return {
      points,
      gapStroke,
      cellRadius,
      finderRadius,
      outlinePath,
      borderStroke,
      logoHex: polygonPoints({ x: 0, y: 0 }, logoRadius),
      viewBox: viewBoxFromBounds(clusterBounds, quietMargin + borderStroke)
    };
  }, [code.cells, code.hasCenterLogo, size, style.cellScale]);

  return (
    <svg
      ref={svgRef}
      className="hex-svg"
      viewBox={geometry.viewBox}
      role="img"
      aria-label="Generated ⬡code"
      style={{
        background: style.lightColor,
        borderRadius: 'var(--radius-lg)',
        transition: 'all 0.3s ease',
        width: 'min(100%, 720px)',
        maxWidth: '100%',
        height: 'auto',
        margin: '0 auto',
        display: 'block',
        border: `1px solid color-mix(in srgb, ${style.frameOuterColor} 28%, transparent)`,
        boxShadow: `0 10px 36px color-mix(in srgb, ${style.frameOuterColor} 16%, transparent)`
      }}
    >
      {geometry.points.map(({ cell, center }) => {
        const fill = colorFor(cell.value, code.level, style);
        const radius = cell.kind === 'finder' || cell.kind === 'fiducial' ? geometry.finderRadius : geometry.cellRadius;
        return (
          <polygon
            key={`${cell.q},${cell.r}`}
            points={polygonPoints(center, radius)}
            fill={fill}
            stroke={geometry.gapStroke > 0 ? fill : 'none'}
            strokeWidth={geometry.gapStroke}
            strokeLinejoin="round"
            shapeRendering="crispEdges"
          />
        );
      })}
      {geometry.outlinePath && (
        <path
          d={geometry.outlinePath}
          fill="none"
          stroke={style.frameOuterColor}
          strokeWidth={geometry.borderStroke}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {code.hasCenterLogo && (
        <g aria-label="Center logo slot">
          <polygon
            points={geometry.logoHex}
            fill={style.logoBgColor}
            stroke={style.logoBorderColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {centerLogo.trim() && (
            <text
              x="0"
              y="0"
              textAnchor="middle"
              dominantBaseline="central"
              fill={style.logoTextColor}
              fontWeight="900"
              fontSize="14"
              letterSpacing="0.04em"
              pointerEvents="none"
              style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
            >
              {centerLogo.trim().slice(0, 4)}
            </text>
          )}
        </g>
      )}
    </svg>
  );
});

import { colorFor } from '../core/hexPreview';
