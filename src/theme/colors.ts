import { ColorSchemeName } from 'react-native';

/**
 * "Field guide" palette: warm paper and spruce ink by day, boreal night after dark.
 * Risk colours are tuned per scheme so they keep contrast on both backgrounds.
 */
export const palette = {
  spruce: '#1F5C45',
  spruceDeep: '#123A2B',
  spruceBright: '#5BC393',
  spruceBrightDeep: '#2E7A57',
  lake: '#2F6F95',
  white: '#FFFFFF',
} as const;

export function createLightColors() {
  return {
    background: '#F2EEE6',
    backgroundElevated: '#EAE4D8',
    card: '#FFFCF6',
    cardSecondary: '#F4EFE5',
    cardTertiary: '#EBE4D5',
    surface: '#FFFCF6',
    surfaceMuted: '#EFE9DD',
    surfaceElevated: '#F4EFE5',
    surfaceDark: palette.spruce,
    surfaceDarkAlt: '#2A7055',
    overlay: 'rgba(255, 252, 246, 0.94)',
    scrim: 'rgba(28, 26, 22, 0.42)',
    text: '#1C1A16',
    textMuted: '#5E594E',
    textSoft: '#767063',
    textOnPrimary: palette.white,
    textOnDark: palette.white,
    primary: palette.spruce,
    primaryLedge: palette.spruceDeep,
    accent: palette.lake,
    primarySoft: '#DCEBE2',
    primaryGlow: '#E8F1EB',
    secondary: '#86C6A4',
    divider: 'rgba(40, 33, 20, 0.09)',
    border: 'rgba(40, 33, 20, 0.12)',
    ledge: '#DCD3C1',
    skeleton: '#E3DCCD',
    shadow: 'rgba(40, 33, 20, 0.10)',
    riskLow: '#23794D',
    riskModerate: '#9E6300',
    riskHigh: '#C8412F',
    low: '#23794D',
    medium: '#9E6300',
    high: '#C8412F',
    lowSoft: '#DDEEE3',
    mediumSoft: '#F6EACB',
    highSoft: '#F6DDD7',
    dangerSoft: '#F6DDD7',
    infoSoft: '#DDE9F1',
  } as const;
}

export function createDarkColors() {
  return {
    background: '#0E1311',
    backgroundElevated: '#131A17',
    card: '#18201C',
    cardSecondary: '#1F2924',
    cardTertiary: '#27332D',
    surface: '#18201C',
    surfaceMuted: '#222C27',
    surfaceElevated: '#1F2924',
    surfaceDark: '#1C3A2D',
    surfaceDarkAlt: '#24493A',
    overlay: 'rgba(24, 32, 28, 0.95)',
    scrim: 'rgba(0, 0, 0, 0.58)',
    text: '#EEF2EC',
    textMuted: '#A8B2AA',
    textSoft: '#86928B',
    textOnPrimary: '#06140D',
    textOnDark: palette.white,
    primary: palette.spruceBright,
    primaryLedge: palette.spruceBrightDeep,
    accent: '#6FB3DB',
    primarySoft: 'rgba(91, 195, 147, 0.16)',
    primaryGlow: '#1D3328',
    secondary: '#6EB892',
    divider: 'rgba(230, 240, 232, 0.08)',
    border: 'rgba(230, 240, 232, 0.10)',
    ledge: '#070A09',
    skeleton: '#232D28',
    shadow: 'rgba(0, 0, 0, 0.45)',
    riskLow: '#4FC086',
    riskModerate: '#F0AC2E',
    riskHigh: '#F2695A',
    low: '#4FC086',
    medium: '#F0AC2E',
    high: '#F2695A',
    lowSoft: 'rgba(79, 192, 134, 0.16)',
    mediumSoft: 'rgba(240, 172, 46, 0.16)',
    highSoft: 'rgba(242, 105, 90, 0.16)',
    dangerSoft: 'rgba(242, 105, 90, 0.16)',
    infoSoft: 'rgba(111, 179, 219, 0.16)',
  } as const;
}

export type ThemeColors = ReturnType<typeof createLightColors> | ReturnType<typeof createDarkColors>;

export function createThemeColors(colorScheme?: ColorSchemeName): ThemeColors {
  return colorScheme === 'dark' ? createDarkColors() : createLightColors();
}

export const lightColors = createLightColors();
export const darkColors = createDarkColors();
export const colors = lightColors;
