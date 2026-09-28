import React from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { CategoryAlert, CategoryId } from '../types/alerts';
import { useAppTheme } from '../theme';
import { formatCategory, formatLastUpdated, formatRiskLevel } from '../utils/format';
import { getRiskColor } from '../utils/risk';
import { RATING_RULES, getCategoryStat } from './SnapshotTile';
import { TactileButton } from './ui/TactileButton';
import { Text } from './ui/Text';

type Props = {
  category: CategoryId | null;
  alert: CategoryAlert | null;
  onClose: () => void;
};

/** Full explanation of one category's rating: the reason, the rule, and the source. */
export function CategoryDetailSheet({ category, alert, onClose }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const insets = useSafeAreaInsets();
  const visible = Boolean(category && alert);

  const unavailable = alert?.dataStatus === 'unavailable';
  const accent = alert && !unavailable ? getRiskColor(alert.riskLevel, c) : c.textSoft;
  const soft = !alert || unavailable
    ? c.cardTertiary
    : alert.riskLevel === 'high'
      ? c.highSoft
      : alert.riskLevel === 'moderate'
        ? c.mediumSoft
        : c.lowSoft;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} accessibilityLabel="Close details" />
        {category && alert ? (
          <View
            style={{
              backgroundColor: c.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '85%',
            }}
          >
            <ScrollView contentContainerStyle={{ padding: sp.lg, paddingBottom: insets.bottom + sp.lg, gap: sp.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: soft,
                  }}
                >
                  <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={22} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole="header" style={{ ...ty.heading, fontSize: 21, color: c.text }}>
                    {formatCategory(category)}
                  </Text>
                  <Text style={{ ...ty.caption, color: accent, fontWeight: '700' }}>
                    {unavailable ? 'No data' : `${formatRiskLevel(alert.riskLevel)} risk`}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
                  <MaterialCommunityIcons name="close" size={24} color={c.textMuted} />
                </Pressable>
              </View>

              <View style={{ padding: sp.md, borderRadius: radii.lg, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, gap: sp.xs }}>
                <Text style={{ ...ty.sectionLabel, color: c.textSoft }}>Why</Text>
                {!unavailable ? (
                  <Text style={{ fontFamily: 'Display-700', fontSize: 20, lineHeight: 25, color: c.text }}>
                    {getCategoryStat(category, alert)}
                  </Text>
                ) : null}
                <Text selectable style={{ ...ty.body, color: c.text }}>
                  {unavailable
                    ? "MOSI couldn't reach this source. It's left out of your score until it loads."
                    : alert.summary}
                </Text>
              </View>

              <View style={{ gap: sp.xs }}>
                <Text style={{ ...ty.sectionLabel, color: c.textSoft }}>How it's rated</Text>
                <Text style={{ ...ty.body, color: c.textMuted }}>{RATING_RULES[category]}</Text>
              </View>

              <View style={{ gap: sp.xs }}>
                <Text style={{ ...ty.sectionLabel, color: c.textSoft }}>Source</Text>
                <Text selectable style={{ ...ty.body, color: c.textMuted }}>
                  {alert.source}
                  {alert.lastUpdated && !unavailable ? ` · updated ${formatLastUpdated(alert.lastUpdated)}` : ''}
                </Text>
              </View>

              {alert.sourceUrl && !unavailable ? (
                <TactileButton
                  label="Open official source"
                  icon="open-in-new"
                  variant="secondary"
                  fullWidth
                  onPress={() => void Linking.openURL(alert.sourceUrl!).catch(() => undefined)}
                />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
