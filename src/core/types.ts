export type ECLevel = 'L' | 'M' | 'Q' | 'H';
export type CellLevel = 2 | 4 | 8;
export type FormatVersion = 1 | 2;

export const FORMAT_VERSION_V2 = 2 as const;

/** Pre-rename generators wrote format version 3; decode as v2. */
export function isModernFormat(formatVersion: number): boolean {
  return formatVersion >= 2;
}

export function normalizeFormatVersion(formatVersion: number): FormatVersion {
  return isModernFormat(formatVersion) ? 2 : 1;
}

export type HexCellKind =
  | 'data'
  | 'finder'
  | 'alignment'
  | 'timing'
  | 'format'
  | 'quiet'
  | 'fiducial'
  | 'sync'
  | 'calibration'
  | 'metadata';

export interface AxialCoord {
  q: number;
  r: number;
}

export interface HexCell extends AxialCoord {
  kind: HexCellKind;
  value: number;
  confidence: number;
}

export interface EncodedHexCode {
  version: number;
  radius: number;
  level: CellLevel;
  ecLevel: ECLevel;
  maskId: number;
  formatVersion: FormatVersion;
  hasCenterLogo: boolean;
  cells: HexCell[];
  payloadLength: number;
}

export interface DecodeResult {
  text: string;
  correctedCells: number;
  confidence: number;
  formatVersion: FormatVersion;
}

export interface HexCodeStyle {
  /** Highest fill level / finder ring color. */
  darkColor: string;
  /** Empty cell and SVG background color. */
  lightColor: string;
  /** Cluster outline stroke color. */
  frameOuterColor: string;
  /** Legacy export field — kept in sync with outline in presets. */
  frameInnerColor: string;
  /** Legacy export field — unused by current renderer. */
  fillerColor: string;
  /** Legacy export field — unused by current renderer. */
  fillerStrongColor: string;
  logoBgColor: string;
  logoTextColor: string;
  logoBorderColor: string;
  /** Honeycomb cell scale; 1.0 = edge-sharing tiles. */
  cellScale: number;
}
