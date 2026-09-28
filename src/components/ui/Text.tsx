import React, { forwardRef } from 'react';
import { Text as RNText, StyleSheet, TextProps } from 'react-native';

import { fonts, resolveFontFamily } from '../../theme/fonts';

/**
 * Drop-in replacement for React Native's Text that maps `fontWeight` onto the
 * matching bundled font file. Every screen imports this instead of RN's Text so
 * inline weight overrides never fall back to the system font.
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, maxFontSizeMultiplier, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = resolveFontFamily(flat.fontFamily ?? fonts.body, flat.fontWeight);

  return (
    <RNText
      ref={ref}
      // Respect the user's font scale, but cap it so dense cards don't break apart.
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? 1.5}
      {...rest}
      style={family ? { ...flat, fontFamily: family, fontWeight: undefined } : flat}
    />
  );
});
