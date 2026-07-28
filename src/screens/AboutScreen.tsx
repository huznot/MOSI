import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { DATA_SOURCE_META, SAFETY_INDEX_WEIGHTS } from '../constants/config';
import { SectionTitle } from '../components/SectionTitle';
import { useAppTheme } from '../theme';
import { CategoryId } from '../types/alerts';
import { formatCategory } from '../utils/format';

const limitations = [
  'MOSI cannot directly predict real-time drinking water quality between official updates.',
  'Vector-borne and wildfire forecasting use seasonal or fallback logic where machine-readable forecast products are limited.',
  'Public health bulletin geography is inferred from published headlines when precise polygons are unavailable.',
  'MOSI is a public-awareness screening tool, not a substitute for emergency instructions or clinical advice.',
];

export function AboutScreen() {
  const theme = useAppTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: 120,
        gap: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <SectionTitle
        eyebrow="MOSI"
        title="About"
        subtitle="How the score is weighted, where the data comes from, and what the app cannot claim."
      />

      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          How MOSI Works
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
          MOSI combines six category signals into a single 0-100 score using weighted averaging. Higher weights reflect
          categories with broader, more consistent impact on outdoor safety in Manitoba.
        </Text>
        {(Object.keys(SAFETY_INDEX_WEIGHTS) as CategoryId[]).map((category) => {
          const pct = Math.round(SAFETY_INDEX_WEIGHTS[category] * 100);
          return (
            <View key={category} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text }}>
                  {formatCategory(category)}
                </Text>
                <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                  {pct}%
                </Text>
              </View>
              <View
                style={{
                  height: 12,
                  borderRadius: 999,
                  backgroundColor: theme.colors.cardSecondary,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 999,
                    backgroundColor: theme.colors.primary,
                  }}
                />
              </View>
            </View>
          );
        })}
        <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
          Score = weighted sum of category risk signals, mapped to a 0-100 display scale.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          Data Sources
        </Text>
        {DATA_SOURCE_META.map((source) => (
          <Pressable
            key={source.name}
            onPress={() => {
              void Linking.openURL(source.url);
            }}
            style={{
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
              backgroundColor: theme.colors.cardSecondary,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text, flex: 1 }}>
                {source.name}
              </Text>
              <MaterialCommunityIcons name="open-in-new" size={14} color={theme.colors.textSoft} />
            </View>
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              {source.provides}
            </Text>
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft }}>
              Update frequency: {source.frequency}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          Limitations
        </Text>
        {limitations.map((item) => (
          <View key={item} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={16}
              color={theme.colors.riskModerate}
              style={{ marginTop: 2 }}
            />
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted, flex: 1 }}>
              {item}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          Attribution
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
          MOSI was built as a Manitoba public health and environmental awareness platform with a focus on health
          equity, clear risk communication, and Northern Manitoba realities that are often missed by generic weather
          apps.
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
          Weather and air quality data are sourced from Environment and Climate Change Canada under open government
          licence. Wildfire data is sourced from the Canadian Forest Service. Water advisory data is sourced from
          Manitoba Infrastructure under open government licence.
        </Text>
      </View>

      <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft, textAlign: 'center' }}>
        Version {version}
      </Text>
    </ScrollView>
  );
}
