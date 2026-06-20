import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, detectPresetKey, HEX_PRESETS, mergeHexStyle } from '../src/themes/hexPresets';

describe('hexPresets', () => {
  it('keeps all presets on edge-sharing cell scale', () => {
    for (const preset of Object.values(HEX_PRESETS)) {
      expect(preset.style.cellScale).toBe(1);
      expect(preset.style.frameOuterColor.length).toBeGreaterThan(0);
    }
  });

  it('detects active preset by palette signature', () => {
    expect(detectPresetKey(HEX_PRESETS.cobalt.style)).toBe('cobalt');
    expect(detectPresetKey(mergeHexStyle({ darkColor: '#123456' }))).toBeNull();
  });

  it('merges partial imports over the default style', () => {
    const merged = mergeHexStyle({ frameOuterColor: '#ff0000' });
    expect(merged.frameOuterColor).toBe('#ff0000');
    expect(merged.lightColor).toBe(DEFAULT_STYLE.lightColor);
  });
});
