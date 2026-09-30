import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { CategoryAlert, CategoryId } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatCategory, formatRiskLevel } from '../utils/format';
import { selectHaptic } from '../utils/haptics';
import { getRiskColor } from '../utils/risk';
import { Text } from './ui/Text';

type Props = {
  category: CategoryId;
  alert: CategoryAlert;
  onPress: () => void;
};

export function getCategoryStat(category: CategoryId, alert: CategoryAlert): string {
  const value = alert.value;

  switch (category) {
    case 'weather': {

      if (typeof value === 'number' && Number.isFinite(value)) {
        return `${Math.round(value)}°C`;
      }

      const tempMatch = alert.summary.match(/[-−]?\d+\s*°C/);
      if (tempMatch) return tempMatch[0];
      return 'See conditions';
    }
    case 'airQuality': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `AQHI ${value.toFixed(1)}`;
      }
      if (typeof value === 'string' && value !== 'n/a') {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) return `AQHI ${parsed.toFixed(1)}`;
      }
      return 'AQHI unavailable';
    }
    case 'wildfire': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value === 0 ? 'No active fires' : `${Math.round(value)} active fires`;
      }
      if (typeof value === 'string' && value !== 'n/a') {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed === 0 ? 'No active fires' : `${parsed} active fires`;
      }
      return 'Seasonal model';
    }
    case 'water': {
      // Show the real count even when the rating is low (e.g. one site-specific advisory),
      // so the headline never contradicts the summary underneath it.
      const count =
        typeof value === 'number' && Number.isFinite(value)
          ? Math.round(value)
          : Number.parseInt(String(value), 10) || Number(/(\d+)\s+(?:public|site)/i.exec(alert.summary)?.[1] ?? 0);
      if (count > 0) return `${count} ${count === 1 ? 'advisory' : 'advisories'} nearby`;
      return 'No advisories';
    }
    case 'vectorBorne': {
      if (alert.riskLevel === 'high') return 'Active season';
      if (alert.riskLevel === 'moderate') return 'Building activity';
      return 'Low activity';
    }
    case 'healthAdvisories': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value === 0 ? 'No bulletins' : `${Math.round(value)} bulletins`;
      }
      if (typeof value === 'string' && value !== 'n/a') {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed === 0 ? 'No bulletins' : `${parsed} bulletins`;
      }
      return 'No bulletins';
    }
    default:
      return '';
  }
}

/** Plain-language rule behind each category's rating, shown when a tile is expanded. */
export const RATING_RULES: Record<CategoryId, string> = {
  weather: 'High with any Environment Canada warning, or at 32°C+ / -30°C or colder. Moderate at 28°C+ / -20°C or colder.',
  airQuality: 'Based on the Air Quality Health Index: 1-3 low, 4-6 moderate, 7+ high.',
  wildfire: 'High with an active fire within 100 km. Moderate with fires within 500 km, since smoke travels. Low otherwise.',
  water: 'High with a public water system advisory at your location. Moderate with a site-specific advisory (e.g. a single facility).',
  vectorBorne: 'Estimated from season, temperature and region for ticks and mosquitoes. Not a direct measurement.',
  healthAdvisories:
    'High for public health emergencies or an emergency alert covering you. Moderate for active advisories, outbreaks or recalls.',
};

export function SnapshotTile({ category, alert, onPress }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const unavailable = alert.dataStatus === 'unavailable';
  // Missing data is shown as neutral grey, never as a risk colour.
  const accent = unavailable ? c.textSoft : getRiskColor(alert.riskLevel, c);
  const soft = unavailable
    ? c.cardTertiary
    : alert.riskLevel === 'high'
      ? c.highSoft
      : alert.riskLevel === 'moderate'
        ? c.mediumSoft
        : c.lowSoft;
  const stat = unavailable ? 'Unavailable' : getCategoryStat(category, alert);
  const levelLabel = unavailable ? 'No data' : formatRiskLevel(alert.riskLevel);
  const reason = unavailable ? "Couldn't reach this source." : alert.summary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatCategory(category)}: ${levelLabel}. ${stat}. ${reason}`}
      accessibilityHint="Shows why it has this rating"
      onPress={() => {
        selectHaptic();
        onPress();
      }}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: '46%',
        backgroundColor: pressed ? c.cardSecondary : c.card,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: c.border,
        padding: sp.md,
        gap: sp.sm,
        minHeight: 150,
        boxShadow: theme.shadows.card,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: soft,
          }}
        >
          <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={20} color={accent} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
          <Text style={{ ...ty.caption, fontSize: 12, color: accent, fontWeight: '700' }}>{levelLabel}</Text>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={{ ...ty.caption, color: c.textMuted }}>{formatCategory(category)}</Text>
        <Text style={{ fontFamily: 'Display-700', fontSize: 19, lineHeight: 23, color: c.text }} numberOfLines={2}>
          {stat}
        </Text>
      </View>

      {/* The "why", visible without tapping; the sheet has the full rule and source. */}
      <Text style={{ ...ty.caption, color: c.textMuted }} numberOfLines={2}>
        {reason}
      </Text>
    </Pressable>
  );
}
