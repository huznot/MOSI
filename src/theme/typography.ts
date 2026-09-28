import { TextStyle } from 'react-native';

import { fonts } from './fonts';

export function createTypography() {
  return {
    hero: {
      fontFamily: fonts.display,
      fontSize: 64,
      lineHeight: 66,
      letterSpacing: -2,
    } satisfies TextStyle,
    display: {
      fontFamily: fonts.display,
      fontSize: 34,
      lineHeight: 38,
      letterSpacing: -0.8,
    } satisfies TextStyle,
    heading: {
      fontFamily: fonts.displayBold,
      fontSize: 24,
      lineHeight: 29,
      letterSpacing: -0.4,
    } satisfies TextStyle,
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      lineHeight: 22,
    } satisfies TextStyle,
    body: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
    } satisfies TextStyle,
    bodyStrong: {
      fontFamily: fonts.bodySemi,
      fontSize: 15,
      lineHeight: 22,
    } satisfies TextStyle,
    caption: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      lineHeight: 18,
    } satisfies TextStyle,
    sectionLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    } satisfies TextStyle,
    tabular: {
      fontFamily: fonts.displayBold,
      fontSize: 15,
      lineHeight: 20,
      fontVariant: ['tabular-nums'],
    } satisfies TextStyle,
  } as const;
}

export const typography = createTypography();
