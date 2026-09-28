import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { CategoryId, RiskLevel, SafetyBreakdownItem } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatRiskLevel } from '../utils/format';
import { getRiskColor, toDisplayedMosiScore } from '../utils/risk';
import { Text } from './ui/Text';

type Props = {
  riskLevel: RiskLevel;
  score: number;
  regionLabel: string;
  breakdown?: SafetyBreakdownItem[];
};

// Display-scale thresholds that match scoreToRiskLevel (raw 1.6 and 2.35).
const SCALE_MAX = 3;
const BANDS: { level: RiskLevel; from: number; to: number }[] = [
  { level: 'low', from: 0, to: 0.9 },
  { level: 'moderate', from: 0.9, to: 2.0 },
  { level: 'high', from: 2.0, to: 3.0 },
];

const ADVICE: Record<RiskLevel, string> = {
  low: 'Good conditions for being outside. Normal precautions apply.',
  moderate: 'Mostly fine, but check what is driving the score before you go.',
  high: 'Real hazards in your area. Review your alerts and consider changing plans.',
};

function getDrivers(breakdown: SafetyBreakdownItem[] | undefined): CategoryId[] {
  if (!breakdown?.length) return [];
  return [...breakdown]
    .filter((item) => item.riskLevel !== 'low')
    .sort((left, right) => right.numericRisk - left.numericRisk || right.weight - left.weight)
    .slice(0, 3)
    .map((item) => item.category);
}

export function SafetyScoreCard({ riskLevel, score, regionLabel, breakdown }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const accent = getRiskColor(riskLevel, c);
  const displayScore = Number.isFinite(score) ? Math.min(SCALE_MAX, Math.max(0, toDisplayedMosiScore(score))) : null;
  const drivers = getDrivers(breakdown);
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      120,
      withTiming((displayScore ?? 0) / SCALE_MAX, { duration: 500, easing: Easing.out(Easing.cubic) }),
    );
  }, [displayScore, progress]);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * trackWidth - 9 }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      accessible
      accessibilityLabel={`MOSI score ${displayScore?.toFixed(1) ?? 'unavailable'} out of 3, ${formatRiskLevel(riskLevel)} risk in ${regionLabel}`}
      style={{
        backgroundColor: c.card,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: c.border,
        padding: sp.lg,
        gap: sp.md,
        boxShadow: theme.shadows.raised,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp.sm }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ ...ty.sectionLabel, color: c.textSoft }}>Right now</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ ...ty.hero, fontSize: 76, lineHeight: 80, color: c.text }}>
              {displayScore !== null ? displayScore.toFixed(1) : '--'}
            </Text>
            <Text style={{ ...ty.bodyStrong, color: c.textSoft, marginBottom: 14 }}>/ 3.0</Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: radii.pill,
            backgroundColor: accent,
            boxShadow: `0 3px 0 ${theme.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.18)'}`,
            marginTop: 4,
          }}
        >
          <MaterialCommunityIcons
            name={riskLevel === 'low' ? 'check-circle' : riskLevel === 'moderate' ? 'alert' : 'alert-octagon'}
            size={16}
            color={theme.isDark ? '#0B120E' : '#FFFFFF'}
          />
          <Text style={{ fontFamily: 'Body-800', fontSize: 14, color: theme.isDark ? '#0B120E' : '#FFFFFF' }}>
            {formatRiskLevel(riskLevel)} risk
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View
          onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', height: 12, gap: 3 }}
        >
          {BANDS.map((band) => (
            <View
              key={band.level}
              style={{
                flex: band.to - band.from,
                borderRadius: 6,
                backgroundColor: getRiskColor(band.level, c),
                opacity: band.level === riskLevel ? 1 : 0.28,
              }}
            />
          ))}
        </View>
        {trackWidth > 0 && displayScore !== null ? (
          <Animated.View style={[{ position: 'absolute', top: -6, left: 5 }, markerStyle]}>
            <View
              style={{
                width: 8,
                height: 24,
                borderRadius: 4,
                backgroundColor: c.text,
                borderWidth: 2,
                borderColor: c.card,
              }}
            />
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ ...ty.caption, fontSize: 11, color: c.textSoft }}>Safer</Text>
          <Text style={{ ...ty.caption, fontSize: 11, color: c.textSoft }}>Riskier</Text>
        </View>
      </View>

      <Text style={{ ...ty.body, fontSize: 16, color: c.text }}>{ADVICE[riskLevel]}</Text>

      {drivers.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Text style={{ ...ty.caption, color: c.textMuted }}>Driven by</Text>
          {drivers.map((category) => {
            const level = breakdown?.find((item) => item.category === category)?.riskLevel ?? 'moderate';
            const color = getRiskColor(level, c);
            return (
              <View
                key={category}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: radii.pill,
                  backgroundColor: level === 'high' ? c.highSoft : c.mediumSoft,
                }}
              >
                <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={13} color={color} />
                <Text style={{ ...ty.caption, fontSize: 12, color, fontWeight: '700' }}>{CATEGORY_META[category].label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}
