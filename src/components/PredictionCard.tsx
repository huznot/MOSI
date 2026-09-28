import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Text } from './ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';

import { CATEGORY_META } from '../constants/config';
import { CategoryPrediction, CategoryId } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatCategory } from '../utils/format';
import { getRiskColor } from '../utils/risk';

type Props = {
  category: CategoryId;
  prediction: CategoryPrediction;
};

type BadgeType = 'live' | 'seasonal' | 'status';

type BadgeProps = {
  type: BadgeType;
  label: string;
};

function SourceBadge({ type, label }: BadgeProps) {
  const theme = useAppTheme();
  const bgColor =
    type === 'live'
      ? `${theme.colors.riskLow}20`
      : type === 'seasonal'
        ? `${theme.colors.riskModerate}20`
        : theme.colors.infoSoft;
  const textColor =
    type === 'live'
      ? theme.colors.riskLow
      : type === 'seasonal'
        ? theme.colors.riskModerate
        : theme.colors.textMuted;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: theme.radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: bgColor,
      }}
    >
      <Text selectable style={{ ...theme.typography.caption, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

function riskColorForValue(value: number, theme: ReturnType<typeof useAppTheme>): string {
  if (value <= 1.59) return theme.colors.riskLow;
  if (value <= 2.34) return theme.colors.riskModerate;
  return theme.colors.riskHigh;
}

export function PredictionCard({ category, prediction }: Props) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const currentRisk = prediction.riskLevels[0] ?? 'low';
  const accent = getRiskColor(currentRisk, theme.colors);
  const chartWidth = Math.max(200, width - theme.spacing.md * 4 - theme.spacing.lg * 2);

  let badgeType: BadgeType = 'status';
  let badgeLabel = 'LIVE STATUS - NO FORECAST';
  if (prediction.sourceType === 'forecast') {
    badgeType = 'live';
    badgeLabel = 'FORECAST - OPEN-METEO';
  } else if (prediction.sourceType === 'seasonal') {
    badgeType = 'seasonal';
    badgeLabel = 'SEASONAL MODEL';
  }

  const values = prediction.values;

  function renderChart() {
    if (category === 'weather') {
      const lineData = values.map((value) => ({ value }));
      return (
        <LineChart
          data={lineData}
          width={chartWidth}
          height={80}
          color={accent}
          thickness={2}
          dataPointsColor={accent}
          dataPointsRadius={4}
          areaChart
          startFillColor={`${accent}40`}
          endFillColor={`${accent}05`}
          noOfSections={3}
          yAxisColor="transparent"
          xAxisColor={theme.colors.divider}
          hideYAxisText
          hideDataPoints={false}
          curved
        />
      );
    }

    if (category === 'airQuality' || category === 'wildfire') {
      const barData = values.map((value) => ({
        value,
        frontColor: riskColorForValue(value, theme),
      }));
      return (
        <BarChart
          data={barData}
          width={chartWidth}
          height={80}
          barWidth={Math.max(8, Math.floor((chartWidth - 20) / Math.max(barData.length, 1)) - 4)}
          noOfSections={3}
          yAxisColor="transparent"
          xAxisColor={theme.colors.divider}
          hideYAxisText
          hideRules={false}
          rulesColor={theme.colors.divider}
          isAnimated
        />
      );
    }

    if (category === 'vectorBorne') {
      const lineData = values.map((value) => ({ value }));
      return (
        <LineChart
          data={lineData}
          width={chartWidth}
          height={80}
          color={accent}
          thickness={2}
          dataPointsColor={accent}
          dataPointsRadius={3}
          areaChart
          startFillColor={`${accent}40`}
          endFillColor={`${accent}05`}
          noOfSections={3}
          yAxisColor="transparent"
          xAxisColor={theme.colors.divider}
          hideYAxisText
          curved
        />
      );
    }

    return null;
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        boxShadow: theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}18`,
            }}
          >
            <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={18} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
              {formatCategory(category)}
            </Text>
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              {prediction.summary}
            </Text>
          </View>
        </View>
        <SourceBadge type={badgeType} label={badgeLabel} />
      </View>

      {category !== 'water' && category !== 'healthAdvisories' ? (
        <View style={{ marginHorizontal: -4 }}>{renderChart()}</View>
      ) : null}

      {category === 'water' || category === 'healthAdvisories' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            backgroundColor: theme.colors.cardSecondary,
            borderRadius: theme.radii.md,
            padding: theme.spacing.md,
          }}
        >
          <MaterialCommunityIcons
            name={category === 'water' ? 'water-check' : 'shield-check-outline'}
            size={36}
            color={accent}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text }}>
              {prediction.summary}
            </Text>
            {prediction.riskLevels[0] ? (
              <Text selectable style={{ ...theme.typography.caption, color: accent }}>
                Current status: {prediction.riskLevels[0]}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {category === 'vectorBorne' ? (
        <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
          Uses a seasonal West Nile virus baseline, a seasonal tick activity baseline, and current weather conditions.
          This is a planning aid, not a real-time surveillance forecast.
        </Text>
      ) : null}
    </View>
  );
}
