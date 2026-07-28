import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../navigation/AppNavigator';
import { formatDistanceKm, formatLastUpdated, formatRiskLevel } from '../utils/format';
import { getRiskColor } from '../utils/risk';
import { useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AlertDetail'>;

export function AlertDetailScreen({ route }: Props) {
  const theme = useAppTheme();
  const alert = route.params.alert;
  const accent = getRiskColor(alert.riskLevel, theme.colors);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.md,
      }}
      showsVerticalScrollIndicator={false}
    >
      {}
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <View
          style={{
            alignSelf: 'flex-start',
            borderRadius: theme.radii.pill,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: `${accent}22`,
          }}
        >
          <Text style={{ ...theme.typography.caption, color: accent }}>{formatRiskLevel(alert.riskLevel)}</Text>
        </View>
        <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
          {alert.title}
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
          {alert.summary}
        </Text>
        {formatDistanceKm(alert.distanceKm) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="map-marker-distance" size={14} color={theme.colors.textMuted} />
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {formatDistanceKm(alert.distanceKm)}
            </Text>
          </View>
        ) : null}
      </View>

      {}
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
          Context
        </Text>

        {}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <MaterialCommunityIcons name="map-outline" size={16} color={theme.colors.textMuted} />
          <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
            {alert.geographicScope}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <MaterialCommunityIcons name="shield-account-outline" size={16} color={theme.colors.textMuted} />
          <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
            {alert.authority}
          </Text>
        </View>

        {}
        {alert.issuedAt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <MaterialCommunityIcons name="calendar-plus" size={16} color={theme.colors.textMuted} />
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
              Issued: {formatLastUpdated(alert.issuedAt)}
            </Text>
          </View>
        ) : null}

        {alert.updatedAt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <MaterialCommunityIcons name="calendar-refresh" size={16} color={theme.colors.textMuted} />
            <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
              Updated: {formatLastUpdated(alert.updatedAt)}
            </Text>
          </View>
        ) : null}
      </View>

      {}
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          boxShadow: theme.shadows.card,
        }}
      >
        <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
          Description
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
          {alert.description}
        </Text>
      </View>

      {}
      {alert.recommendedActions.length > 0 ? (
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
            What to do
          </Text>
          {alert.recommendedActions.map((action) => (
            <View
              key={action}
              style={{
                flexDirection: 'row',
                gap: theme.spacing.sm,
                alignItems: 'flex-start',
                backgroundColor: `${accent}10`,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
              }}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={20}
                color={accent}
                style={{ marginTop: 1 }}
              />
              <Text selectable style={{ ...theme.typography.body, color: theme.colors.text, flex: 1 }}>
                {action}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {}
      {alert.sourceUrl ? (
        <Pressable
          onPress={() => {
            void Linking.openURL(alert.sourceUrl!);
          }}
          style={{
            borderRadius: theme.radii.lg,
            padding: theme.spacing.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <MaterialCommunityIcons name="open-in-new" size={16} color={theme.colors.textMuted} />
          <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>View original source</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
