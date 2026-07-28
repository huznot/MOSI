import { TextStyle } from 'react-native';

const systemFont = undefined;

export function createTypography() {
  return {
    hero: {
      fontFamily: systemFont,
      fontSize: 56,
      lineHeight: 60,
      fontWeight: '800',
      letterSpacing: -1.4,
    } satisfies TextStyle,
    display: {
      fontFamily: systemFont,
      fontSize: 40,
      lineHeight: 44,
      fontWeight: '800',
      letterSpacing: -0.8,
    } satisfies TextStyle,
    heading: {
      fontFamily: systemFont,
      fontSize: 24,
      lineHeight: 29,
      fontWeight: '700',
      letterSpacing: -0.4,
    } satisfies TextStyle,
    title: {
      fontFamily: systemFont,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
    } satisfies TextStyle,
    body: {
      fontFamily: systemFont,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
    } satisfies TextStyle,
    bodyStrong: {
      fontFamily: systemFont,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700',
    } satisfies TextStyle,
    caption: {
      fontFamily: systemFont,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    } satisfies TextStyle,
    sectionLabel: {
      fontFamily: systemFont,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    } satisfies TextStyle,
    tabular: {
      fontFamily: systemFont,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    } satisfies TextStyle,
  } as const;
}

export const typography = createTypography();
