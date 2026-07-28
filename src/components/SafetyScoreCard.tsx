import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { RiskLevel, SafetyBreakdownItem } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatRiskLevel } from '../utils/format';
import { getRiskColor, normalizeMosiScore } from '../utils/risk';

type Props = {
  riskLevel: RiskLevel;
  score: number;
  regionLabel: string;
  breakdown?: SafetyBreakdownItem[];
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 200;
const RING_STROKE = 14;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getTopDriver(breakdown: SafetyBreakdownItem[] | undefined): string | null {
  if (!breakdown || breakdown.length === 0) return null;
  const sorted = [...breakdown].sort((left, right) => right.numericRisk - left.numericRisk);
  const top = sorted[0];
  if (!top || top.riskLevel === 'low') return null;

  const labels: Record<string, string> = {
    weather: 'Weather',
    airQuality: 'Air Quality',
    wildfire: 'Wildfire',
    water: 'Water Advisories',
    vectorBorne: 'Vector-Borne',
    healthAdvisories: 'Health Advisories',
  };

  return labels[top.category] ?? top.category;
}

export function SafetyScoreCard({ riskLevel, score, regionLabel, breakdown }: Props) {
  const theme = useAppTheme();
  const accent = getRiskColor(riskLevel, theme.colors);
  const progress = useSharedValue(0);
  const cardBg = theme.isDark ? '#1B4332' : '#F0FDF4';

  useEffect(() => {
    progress.value = withTiming(normalizeMosiScore(score), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE - progress.value * CIRCUMFERENCE,
  }));

  const topDriver = getTopDriver(breakdown);
  const showDriver = (riskLevel === 'moderate' || riskLevel === 'high') && topDriver !== null;

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={{
        backgroundColor: cardBg,
        borderRadius: 28,
        padding: theme.spacing.xl,
        gap: theme.spacing.md,
        boxShadow: theme.shadows.floating,
        alignItems: 'center',
      }}
    >
      <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <AnimatedCircle
            animatedProps={animatedProps}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={accent}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            rotation="-90"
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>

        <View style={{ alignItems: 'center', gap: 0 }}>
          <Text
            selectable
            style={{
              fontSize: 58,
              fontWeight: '800',
              lineHeight: 62,
              color: theme.isDark ? '#FFFFFF' : '#11181C',
              letterSpacing: -1,
            }}
          >
            {Number.isFinite(score) ? ((score - 1) * 1.5).toFixed(1) : '--'}
          </Text>
          <Text
            selectable
            style={{
              fontSize: 12,
              fontWeight: '500',
              color: theme.isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)',
              letterSpacing: 0.5,
            }}
          >
            / 3.0
          </Text>
        </View>
      </View>

      <Text
        selectable
        style={{
          ...theme.typography.display,
          color: accent,
          marginTop: -theme.spacing.sm,
        }}
      >
        {formatRiskLevel(riskLevel)}
      </Text>

      <Text
        selectable
        style={{
          ...theme.typography.body,
          color: theme.isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
        }}
      >
        {regionLabel}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          borderRadius: theme.radii.pill,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}
      >
        <Text
          selectable
          style={{
            fontSize: 10,
            fontWeight: '500',
            color: theme.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.40)',
            letterSpacing: 0.3,
          }}
        >
          0.0 safe | 1.5 moderate | 3.0 high risk
        </Text>
      </View>

      {showDriver ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: `${accent}22`,
            borderRadius: theme.radii.pill,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text
            selectable
            style={{
              ...theme.typography.caption,
              color: accent,
            }}
          >
            Driven by {topDriver}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
