import React, { createContext, useContext, useMemo } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';

import { usePreferencesStore } from '../state/usePreferencesStore';
import { ThemeColors, createThemeColors } from './colors';
import { fonts } from './fonts';
import { radii, spacing } from './spacing';
import { createTypography } from './typography';

export type AppTheme = {
  colorScheme: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: ReturnType<typeof createTypography>;
  fonts: typeof fonts;
  shadows: {
    card: string;
    floating: string;
    raised: string;
  };
};

function resolveScheme(colorScheme?: ColorSchemeName) {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export function createAppTheme(colorScheme?: ColorSchemeName): AppTheme {
  const resolvedScheme = resolveScheme(colorScheme);
  const isDark = resolvedScheme === 'dark';
  const colors = createThemeColors(resolvedScheme);

  return {
    colorScheme: resolvedScheme,
    isDark,
    colors,
    spacing,
    radii,
    typography: createTypography(),
    fonts,
    // Cards sit on a crisp 2px "ledge" plus a soft ambient shadow - the tactile look
    // shared by every surface in the app.
    shadows: {
      card: isDark
        ? `0 2px 0 ${colors.ledge}, 0 12px 28px rgba(0, 0, 0, 0.32)`
        : `0 2px 0 ${colors.ledge}, 0 10px 24px rgba(40, 33, 20, 0.06)`,
      raised: isDark
        ? `0 4px 0 ${colors.ledge}, 0 16px 32px rgba(0, 0, 0, 0.38)`
        : `0 4px 0 ${colors.ledge}, 0 14px 30px rgba(40, 33, 20, 0.08)`,
      floating: isDark ? '0 22px 44px rgba(0, 0, 0, 0.5)' : '0 22px 44px rgba(40, 33, 20, 0.16)',
    },
  };
}

const ThemeContext = createContext<AppTheme>(createAppTheme('light'));

type Props = {
  children: React.ReactNode;
};

export function ThemeProvider({ children }: Props) {
  const systemScheme = useColorScheme();
  const preference = usePreferencesStore((state) => state.themePreference);
  const scheme = preference === 'system' ? systemScheme : preference;
  const theme = useMemo(() => createAppTheme(scheme), [scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
