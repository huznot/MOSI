import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PredictionDay } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatRiskLevel, formatTemperature } from '../utils/format';
import { getRiskColor, toDisplayedMosiScore } from '../utils/risk';

type Props = {
  days: PredictionDay[];
  selectedIsoDate?: string;
  onSelect?: (isoDate: string) => void;
};

export function ForecastStrip({ days, selectedIsoDate, onSelect }: Props) {
  const theme = useAppTheme();
  const CARD_WIDTH = 126;
  const todayKey = new Date().toDateString();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
      {days.map((day, index) => {
        const accent = getRiskColor(day.riskLevel, theme.colors);
        const isToday = new Date(day.isoDate).toDateString() === todayKey;
        const isSelected = selectedIsoDate === day.isoDate;

        return (
          <Pressable
            key={day.isoDate}
            onPress={() => {
              onSelect?.(day.isoDate);
            }}
            style={{
              width: CARD_WIDTH,
              padding: theme.spacing.md,
              borderRadius: theme.radii.lg,
              backgroundColor: isSelected ? theme.colors.cardTertiary : theme.colors.card,
              gap: theme.spacing.xs,
              boxShadow: theme.shadows.card,
              borderWidth: 1,
              borderColor: isSelected ? `${accent}66` : theme.colors.divider,
            }}
          >
            <View
              style={{
                height: 4,
                borderRadius: 999,
                backgroundColor: isSelected ? accent : `${accent}1F`,
                marginBottom: theme.spacing.xs,
              }}
            />
            <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
              {day.label}
            </Text>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isSelected ? `${accent}24` : `${accent}16`,
              }}
            >
              <MaterialCommunityIcons name={day.icon as never} size={20} color={accent} />
            </View>
            <Text selectable style={{ ...theme.typography.title, color: accent }}>
              {formatRiskLevel(day.riskLevel)}
            </Text>
            {isSelected || isToday ? (
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: theme.radii.pill,
                  backgroundColor: isSelected ? `${accent}18` : theme.colors.cardSecondary,
                }}
              >
                <Text selectable style={{ ...theme.typography.caption, color: isSelected ? accent : theme.colors.textMuted }}>
                  {isToday ? 'Today' : 'Selected'}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <Text selectable style={{ ...theme.typography.tabular, color: theme.colors.text }}>
                {toDisplayedMosiScore(day.score).toFixed(1)}
              </Text>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, fontSize: 10 }}>
                / 3
              </Text>
            </View>
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {formatTemperature(day.highC)} / {formatTemperature(day.lowC)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
