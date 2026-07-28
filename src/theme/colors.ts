import { ColorSchemeName } from 'react-native';

export const palette = {
  primary: '#2D6A4F',
  accent: '#52B788',
  backgroundLight: '#F8F9FA',
  backgroundDark: '#0D1117',
  cardLight: '#FFFFFF',
  cardDark: '#161B22',
  low: '#52B788',
  moderate: '#E9A800',
  high: '#E63946',
  white: '#FFFFFF',
} as const;

export function createLightColors() {
  return {
    background: palette.backgroundLight,
    backgroundElevated: '#EEF2F5',
    card: palette.cardLight,
    cardSecondary: '#F2F6F4',
    cardTertiary: '#E9F1ED',
    surface: palette.cardLight,
    surfaceMuted: '#EDF2EE',
    surfaceElevated: '#F2F6F4',
    surfaceDark: palette.primary,
    surfaceDarkAlt: '#3C7B5E',
    overlay: 'rgba(248, 249, 250, 0.82)',
    text: '#11181C',
    textMuted: '#5B6670',
    textSoft: '#7B8790',
    textOnPrimary: palette.white,
    textOnDark: palette.white,
    primary: palette.primary,
    accent: palette.accent,
    primarySoft: '#DCEFE6',
    primaryGlow: '#E8F4EF',
    secondary: '#86C6A4',
    divider: 'rgba(17, 24, 28, 0.08)',
    border: 'rgba(17, 24, 28, 0.08)',
    skeleton: '#D9DEE3',
    shadow: 'rgba(15, 23, 42, 0.08)',
    riskLow: palette.low,
    riskModerate: palette.moderate,
    riskHigh: palette.high,
    low: palette.low,
    medium: palette.moderate,
    high: palette.high,
    lowSoft: '#E2F3EB',
    mediumSoft: '#F8F0D6',
    highSoft: '#FBE1E3',
    dangerSoft: '#FBE1E3',
    infoSoft: '#E5EEF8',
  } as const;
}

export function createDarkColors() {
  return {
    background: palette.backgroundDark,
    backgroundElevated: '#11161D',
    card: palette.cardDark,
    cardSecondary: '#1C222B',
    cardTertiary: '#22302B',
    surface: palette.cardDark,
    surfaceMuted: '#222A34',
    surfaceElevated: '#1B222B',
    surfaceDark: palette.primary,
    surfaceDarkAlt: '#3C7B5E',
    overlay: 'rgba(13, 17, 23, 0.82)',
    text: '#F5F7FA',
    textMuted: '#A7B0B8',
    textSoft: '#7E8790',
    textOnPrimary: palette.white,
    textOnDark: palette.white,
    primary: palette.primary,
    accent: palette.accent,
    primarySoft: '#A6D7BE',
    primaryGlow: '#284536',
    secondary: '#6EB892',
    divider: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.08)',
    skeleton: '#2A333D',
    shadow: 'rgba(0, 0, 0, 0.34)',
    riskLow: palette.low,
    riskModerate: palette.moderate,
    riskHigh: palette.high,
    low: palette.low,
    medium: palette.moderate,
    high: palette.high,
    lowSoft: 'rgba(82, 183, 136, 0.18)',
    mediumSoft: 'rgba(233, 168, 0, 0.18)',
    highSoft: 'rgba(230, 57, 70, 0.18)',
    dangerSoft: 'rgba(230, 57, 70, 0.18)',
    infoSoft: 'rgba(98, 164, 234, 0.18)',
  } as const;
}

export function createThemeColors(colorScheme?: ColorSchemeName) {
  return colorScheme === 'dark' ? createDarkColors() : createLightColors();
}

export const lightColors = createLightColors();
export const darkColors = createDarkColors();
export const colors = lightColors;
