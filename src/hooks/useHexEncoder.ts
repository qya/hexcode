import { useMemo } from 'react';
import { tryEncodeText, type EncodeOptions, type EncodeResult } from '../core/encoder';

export function useHexEncoder(text: string, options: EncodeOptions): EncodeResult {
  return useMemo(
    () => tryEncodeText(text, options),
    [text, options.centerLogo, options.ecLevel, options.formatVersion, options.level, options.version]
  );
}
