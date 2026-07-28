import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { CategoryAlert, CategoryId } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatCategory, formatLastUpdated, formatRiskLevel } from '../utils/format';
import { getRiskColor } from '../utils/risk';

type Props = {
  category: CategoryId;
  alert: CategoryAlert;
  expanded: boolean;
  onPress: () => void;
  index?: number;
};

function getCategoryStat(category: CategoryId, alert: CategoryAlert): string {
  const value = alert.value;

  switch (category) {
    case 'weather': {

      if (typeof value === 'number' && Number.isFinite(value)) {
        return `${Math.round(value)}°C`;
      }

      const tempMatch = alert.summary.match(/[-−]?\d+\s*°C/);
      if (tempMatch) return tempMatch[0];
      return 'Current conditions';
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
      if (alert.riskLevel === 'low') {
        return '0 advisories';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value === 0 ? '0 advisories' : `${Math.round(value)} nearby`;
      }
      if (typeof value === 'string' && value !== 'n/a') {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed === 0 ? '0 advisories' : `${parsed} nearby`;
      }
      return '0 advisories';
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

function SkeletonTile() {
  const theme = useAppTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          flex: 1,
          minWidth: '48%',
          height: 150,
          backgroundColor: theme.colors.skeleton,
          borderRadius: theme.radii.lg,
        },
      ]}
    />
  );
}

export function SnapshotTile({ category, alert, expanded, onPress, index = 0 }: Props) {
  const theme = useAppTheme();
  const accent = getRiskColor(alert.riskLevel, theme.colors);
  const stat = getCategoryStat(category, alert);

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 60)}
      layout={LinearTransition.springify()}
      style={{ flex: 1, minWidth: '48%' }}
    >
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          minHeight: expanded ? 200 : 150,
          boxShadow: theme.shadows.card,
        }}
      >
        {}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}20`,
            }}
          >
            <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={18} color={accent} />
          </View>

          <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.cardSecondary,
                borderWidth: 1,
                borderColor: theme.colors.divider,
              }}
            >
              <MaterialCommunityIcons
                name={expanded ? 'minus' : 'plus'}
                size={15}
                color={theme.colors.textMuted}
              />
            </View>

            {}
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: theme.radii.pill,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: `${accent}18`,
              }}
            >
              <Text selectable style={{ ...theme.typography.caption, color: accent }}>
                {formatRiskLevel(alert.riskLevel)}
              </Text>
            </View>
          </View>
        </View>

        {}
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          {formatCategory(category)}
        </Text>

        {}
        {stat ? (
          <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.textMuted }}>
            {stat}
          </Text>
        ) : null}

        {}
        {expanded ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(140)}
            style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}
          >
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              {alert.summary}
            </Text>
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
              Source: {alert.source}
            </Text>
            {alert.lastUpdated ? (
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
                Updated: {formatLastUpdated(alert.lastUpdated)}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export { SkeletonTile };
