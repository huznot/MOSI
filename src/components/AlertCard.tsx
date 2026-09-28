import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { AlertDetail } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatDistanceKm, formatLastUpdated, formatRiskLevel } from '../utils/format';
import { getRiskColor } from '../utils/risk';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';

type Props = {
  item: AlertDetail;
  onPress: () => void;
};

export function AlertCard({ item, onPress }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty } = theme;
  const accent = getRiskColor(item.riskLevel, c);
  const soft = item.riskLevel === 'high' ? c.highSoft : item.riskLevel === 'moderate' ? c.mediumSoft : c.lowSoft;
  const distance = formatDistanceKm(item.distanceKm);

  return (
    <Surface
      onPress={onPress}
      accessibilityLabel={`${formatRiskLevel(item.riskLevel)} risk: ${item.title}`}
      accessibilityHint="Opens alert details"
      style={{ gap: sp.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sp.sm }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: soft,
          }}
        >
          <MaterialCommunityIcons name={CATEGORY_META[item.category].icon as never} size={20} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...ty.caption, fontSize: 12, color: accent, fontWeight: '700' }}>
            {CATEGORY_META[item.category].label}
          </Text>
          <Text style={{ ...ty.title, color: c.text }} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={c.textSoft} />
      </View>

      <Text style={{ ...ty.body, color: c.textMuted }} numberOfLines={3}>
        {item.summary}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp.sm }}>
        <MetaPill icon="clock-outline" text={formatLastUpdated(item.updatedAt)} />
        {distance ? <MetaPill icon="map-marker-distance" text={distance} /> : null}
        <MetaPill icon="shield-account-outline" text={item.source} />
      </View>
    </Surface>
  );
}

function MetaPill({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  const { colors: c, typography: ty } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
      <MaterialCommunityIcons name={icon} size={13} color={c.textSoft} />
      <Text style={{ ...ty.caption, fontSize: 12, color: c.textSoft, flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
