import type { HexCodeStyle } from '../core/types';

/** Default print-ready palette aligned with cluster-outline rendering. */
export const DEFAULT_STYLE: HexCodeStyle = {
  darkColor: '#0f172a',
  lightColor: '#f8fafc',
  frameOuterColor: '#0f172a',
  frameInnerColor: '#0f172a',
  fillerColor: '#e2e8f0',
  fillerStrongColor: '#cbd5e1',
  logoBgColor: '#f8fafc',
  logoTextColor: '#0f172a',
  logoBorderColor: '#0f172a',
  cellScale: 1
};

export type HexPresetKey = 'classic' | 'cobalt' | 'cyberpunk' | 'emerald' | 'sunset' | 'nordic' | 'mono';

export interface HexPreset {
  label: string;
  description: string;
  style: HexCodeStyle;
}

export const HEX_PRESETS: Record<HexPresetKey, HexPreset> = {
  classic: {
    label: 'Classic Slate',
    description: 'Light print-ready contrast with a crisp dark outline',
    style: DEFAULT_STYLE
  },
  cobalt: {
    label: 'Cobalt Lattice',
    description: 'Matches the app accent — cool blues on soft white',
    style: {
      darkColor: '#1e3a8a',
      lightColor: '#f0f4ff',
      frameOuterColor: '#5b7fff',
      frameInnerColor: '#5b7fff',
      fillerColor: '#dbeafe',
      fillerStrongColor: '#93c5fd',
      logoBgColor: '#f0f4ff',
      logoTextColor: '#1e3a8a',
      logoBorderColor: '#5b7fff',
      cellScale: 1
    }
  },
  cyberpunk: {
    label: 'Cyberpunk Neon',
    description: 'Dark canvas, magenta data cells, cyan cluster outline',
    style: {
      darkColor: '#f472b6',
      lightColor: '#111827',
      frameOuterColor: '#22d3ee',
      frameInnerColor: '#22d3ee',
      fillerColor: '#1f2937',
      fillerStrongColor: '#374151',
      logoBgColor: '#0b0f19',
      logoTextColor: '#22d3ee',
      logoBorderColor: '#f472b6',
      cellScale: 1
    }
  },
  emerald: {
    label: 'Emerald Forest',
    description: 'Natural greens with a deep forest outline',
    style: {
      darkColor: '#047857',
      lightColor: '#ecfdf5',
      frameOuterColor: '#065f46',
      frameInnerColor: '#065f46',
      fillerColor: '#d1fae5',
      fillerStrongColor: '#6ee7b7',
      logoBgColor: '#ecfdf5',
      logoTextColor: '#065f46',
      logoBorderColor: '#047857',
      cellScale: 1
    }
  },
  sunset: {
    label: 'Sunset Glow',
    description: 'Warm cream base with violet cells and ember outline',
    style: {
      darkColor: '#6d28d9',
      lightColor: '#fff7ed',
      frameOuterColor: '#ea580c',
      frameInnerColor: '#ea580c',
      fillerColor: '#ffedd5',
      fillerStrongColor: '#fdba74',
      logoBgColor: '#fff7ed',
      logoTextColor: '#7c2d12',
      logoBorderColor: '#ea580c',
      cellScale: 1
    }
  },
  nordic: {
    label: 'Nordic Frost',
    description: 'Arctic neutrals with a muted blue-gray outline',
    style: {
      darkColor: '#2e3440',
      lightColor: '#eceff4',
      frameOuterColor: '#5e81ac',
      frameInnerColor: '#5e81ac',
      fillerColor: '#d8dee9',
      fillerStrongColor: '#aeb8c9',
      logoBgColor: '#eceff4',
      logoTextColor: '#2e3440',
      logoBorderColor: '#5e81ac',
      cellScale: 1
    }
  },
  mono: {
    label: 'Mono Scan',
    description: 'Maximum contrast for reliable camera decode',
    style: {
      darkColor: '#000000',
      lightColor: '#ffffff',
      frameOuterColor: '#000000',
      frameInnerColor: '#000000',
      fillerColor: '#f3f4f6',
      fillerStrongColor: '#d1d5db',
      logoBgColor: '#ffffff',
      logoTextColor: '#000000',
      logoBorderColor: '#000000',
      cellScale: 1
    }
  }
};

export const STYLE_COLOR_FIELDS: Array<{ key: keyof HexCodeStyle; label: string; group: 'cells' | 'outline' | 'logo' }> =
  [
    { key: 'lightColor', label: 'Empty Cells', group: 'cells' },
    { key: 'darkColor', label: 'Filled Cells', group: 'cells' },
    { key: 'frameOuterColor', label: 'Cluster Outline', group: 'outline' },
    { key: 'logoBgColor', label: 'Logo Background', group: 'logo' },
    { key: 'logoTextColor', label: 'Logo Text', group: 'logo' },
    { key: 'logoBorderColor', label: 'Logo Border', group: 'logo' }
  ];

export function mergeHexStyle(partial: Partial<HexCodeStyle> = {}): HexCodeStyle {
  return { ...DEFAULT_STYLE, ...partial };
}

export function detectPresetKey(style: HexCodeStyle): HexPresetKey | null {
  for (const [key, preset] of Object.entries(HEX_PRESETS) as Array<[HexPresetKey, HexPreset]>) {
    const sample = preset.style;
    if (
      style.lightColor === sample.lightColor &&
      style.darkColor === sample.darkColor &&
      style.frameOuterColor === sample.frameOuterColor
    ) {
      return key;
    }
  }
  return null;
}
