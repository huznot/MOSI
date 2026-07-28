import React, { createContext, useContext, useMemo } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';

import { createThemeColors } from './colors';
import { radii, spacing } from './spacing';
import { createTypography } from './typography';

type AppTheme = {
  colorScheme: 'light' | 'dark';
  isDark: boolean;
  colors: ReturnType<typeof createThemeColors>;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: ReturnType<typeof createTypography>;
  shadows: {
    card: string;
    floating: string;
  };
};

function resolveScheme(colorScheme?: ColorSchemeName) {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export function createAppTheme(colorScheme?: ColorSchemeName): AppTheme {
  const resolvedScheme = resolveScheme(colorScheme);
  const isDark = resolvedScheme === 'dark';

  return {
    colorScheme: resolvedScheme,
    isDark,
    colors: createThemeColors(resolvedScheme),
    spacing,
    radii,
    typography: createTypography(),
    shadows: {
      card: isDark ? '0 18px 36px rgba(0, 0, 0, 0.36)' : '0 18px 36px rgba(15, 23, 42, 0.08)',
      floating: isDark ? '0 22px 44px rgba(0, 0, 0, 0.46)' : '0 22px 44px rgba(15, 23, 42, 0.12)',
    },
  };
}

const ThemeContext = createContext<AppTheme>(createAppTheme('light'));

type Props = {
  children: React.ReactNode;
};

export function ThemeProvider({ children }: Props) {
  const colorScheme = useColorScheme();
  const theme = useMemo(() => createAppTheme(colorScheme), [colorScheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
