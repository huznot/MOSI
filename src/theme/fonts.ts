import { TextStyle } from 'react-native';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';

/**
 * Bricolage Grotesque carries headings and numbers; Figtree carries everything else.
 * Each weight is registered as its own family because Android cannot synthesize
 * weights from a single custom font file.
 */
export const FONT_ASSETS = {
  'Display-600': BricolageGrotesque_600SemiBold,
  'Display-700': BricolageGrotesque_700Bold,
  'Display-800': BricolageGrotesque_800ExtraBold,
  'Body-400': Figtree_400Regular,
  'Body-500': Figtree_500Medium,
  'Body-600': Figtree_600SemiBold,
  'Body-700': Figtree_700Bold,
  'Body-800': Figtree_800ExtraBold,
} as const;

export const fonts = {
  display: 'Display-800',
  displayBold: 'Display-700',
  displaySemi: 'Display-600',
  body: 'Body-400',
  bodyMedium: 'Body-500',
  bodySemi: 'Body-600',
  bodyBold: 'Body-700',
  bodyHeavy: 'Body-800',
} as const;

const FAMILY_WEIGHTS = {
  Display: [600, 700, 800],
  Body: [400, 500, 600, 700, 800],
} as const;

type Family = keyof typeof FAMILY_WEIGHTS;

function parseWeight(weight: TextStyle['fontWeight']): number | null {
  if (weight === undefined || weight === null) return null;
  if (weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  const parsed = typeof weight === 'number' ? weight : parseInt(weight, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nearest(weights: readonly number[], target: number) {
  return weights.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best,
  );
}

/**
 * Resolves a flattened text style to one of the registered font files, so inline
 * `fontWeight` overrides still pick the right face on every platform.
 */
export function resolveFontFamily(fontFamily: string | undefined, fontWeight: TextStyle['fontWeight']) {
  let family: Family = 'Body';
  let weight = parseWeight(fontWeight);

  if (fontFamily) {
    const match = /^(Display|Body)-(\d{3})$/.exec(fontFamily);
    if (!match) {
      // Not one of ours (e.g. monospace) - leave it alone.
      return null;
    }
    family = match[1] as Family;
    weight = weight ?? Number(match[2]);
  }

  return `${family}-${nearest(FAMILY_WEIGHTS[family], weight ?? 400)}`;
}
