import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { AlertDetail } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatDistanceKm, formatLastUpdated } from '../utils/format';
import { getRiskColor } from '../utils/risk';

type Props = {
  item: AlertDetail;
  onPress: () => void;
};

export function AlertCard({ item, onPress }: Props) {
  const theme = useAppTheme();
  const accent = getRiskColor(item.riskLevel, theme.colors);

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        boxShadow: theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
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
            <MaterialCommunityIcons name={CATEGORY_META[item.category].icon as never} size={18} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
              {item.title}
            </Text>
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {item.source}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSoft} />
      </View>

      <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
        {item.summary}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
          {formatLastUpdated(item.updatedAt)}
        </Text>
        {formatDistanceKm(item.distanceKm) ? (
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
            {formatDistanceKm(item.distanceKm)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
