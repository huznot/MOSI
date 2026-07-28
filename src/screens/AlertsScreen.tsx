import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AlertCard } from '../components/AlertCard';
import { FilterChips } from '../components/FilterChips';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { RootStackParamList } from '../navigation/AppNavigator';
import { buildProvinceWideAlerts, buildVisibleAlerts } from '../services/alert-feed-service';
import { useAppStore } from '../state/useAppStore';
import { useAppTheme } from '../theme';
import { CategoryId, RiskLevel } from '../types/alerts';

type AlertFeedMode = 'relevant' | 'province';

const options: { label: string; value: CategoryId | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Weather', value: 'weather' },
  { label: 'Air', value: 'airQuality' },
  { label: 'Wildfire', value: 'wildfire' },
  { label: 'Water', value: 'water' },
  { label: 'Vectors', value: 'vectorBorne' },
  { label: 'Health', value: 'healthAdvisories' },
];

const feedModes: { label: string; value: AlertFeedMode }[] = [
  { label: 'For You', value: 'relevant' },
  { label: 'Province', value: 'province' },
];

const riskConfig: Record<RiskLevel, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  high: { label: 'High Risk', icon: 'alert-circle' },
  moderate: { label: 'Moderate Risk', icon: 'alert' },
  low: { label: 'Low Risk', icon: 'information-outline' },
};

export function AlertsScreen() {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii, shadows } = theme;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [feedMode, setFeedMode] = useState<AlertFeedMode>('relevant');

  const regionId = useAppStore((s) => s.selectedRegionId);
  const snapshots = useAppStore((s) => s.snapshots);
  const selectedAreaSnapshot = useAppStore((s) => s.selectedAreaSnapshot);
  const selectedAreaAlertDetails = useAppStore((s) => s.selectedAreaAlertDetails);
  const rawAlertDetails = useAppStore((s) => s.rawAlertDetails);
  const mapLocationAlerts = useAppStore((s) => s.mapLocationAlerts);
  const selectedAlertFilter = useAppStore((s) => s.selectedAlertFilter);
  const setSelectedAlertFilter = useAppStore((s) => s.setSelectedAlertFilter);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const isRefreshing = useAppStore((s) => s.isRefreshing);
  const isRegionSwitching = useAppStore((s) => s.isRegionSwitching);
  const locationSource = useAppStore((s) => s.locationSource);
  const userCoordinates = useAppStore((s) => s.userCoordinates);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];

  const relevantAlerts = useMemo(
    () =>
      buildVisibleAlerts({
        snapshot,
        rawAlertDetails: selectedAreaAlertDetails,
        selectedFilter: selectedAlertFilter,
        locationSource,
        userCoordinates,
      }),
    [locationSource, selectedAlertFilter, selectedAreaAlertDetails, snapshot, userCoordinates],
  );
  const provinceAlerts = useMemo(
    () =>
      buildProvinceWideAlerts({
        snapshots,
        rawAlertDetails,
        mapLocationAlerts,
        selectedFilter: selectedAlertFilter,
      }),
    [mapLocationAlerts, rawAlertDetails, selectedAlertFilter, snapshots],
  );
  const alerts = feedMode === 'province' ? provinceAlerts : relevantAlerts;

  const grouped = (['high', 'moderate', 'low'] as RiskLevel[]).map((riskLevel) => ({
    riskLevel,
    items: alerts.filter((a) => a.riskLevel === riskLevel),
  }));

  const highCount = grouped[0].items.length;
  const modCount = grouped[1].items.length;
  const lowCount = grouped[2].items.length;
  const total = alerts.length;
  const scopeLabel = feedMode === 'province' ? 'Across Manitoba' : snapshot.region.label;
  const scopeSummary =
    feedMode === 'province'
      ? 'Scanning all Manitoba health regions'
      : locationSource === 'gps'
        ? 'Relevant to your GPS location'
        : `Filtered to ${snapshot.region.label}`;
  const emptyStateCopy =
    feedMode === 'province'
      ? 'No active alerts were detected across Manitoba right now.'
      : locationSource === 'gps'
        ? 'No active alerts are relevant to your current location right now.'
        : `No active alerts for ${snapshot.region.label} at this time.`;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: sp.md,
        paddingTop: sp.lg,
        paddingBottom: 120,
        gap: sp.md,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={c.primary} />}
    >
      {}
      <View style={{ gap: 4 }}>
        <Text style={{ ...ty.sectionLabel, color: c.textSoft, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
          {scopeLabel}
        </Text>
        <Text style={{ ...ty.heading, color: c.text, fontWeight: '800', letterSpacing: -0.5 }}>
          Alerts
        </Text>
      </View>

      <View
        style={{
          backgroundColor: c.cardSecondary,
          borderRadius: radii.xl,
          padding: 4,
          flexDirection: 'row',
          gap: 4,
        }}
      >
        {feedModes.map((mode) => {
          const active = mode.value === feedMode;
          return (
            <Pressable
              key={mode.value}
              onPress={() => setFeedMode(mode.value)}
              style={{
                flex: 1,
                borderRadius: radii.pill,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: active ? c.card : 'transparent',
                borderWidth: active ? 1 : 0,
                borderColor: active ? c.divider : 'transparent',
              }}
            >
              <Text
                style={{
                  ...ty.bodyStrong,
                  color: active ? c.text : c.textMuted,
                  textAlign: 'center',
                }}
              >
                {mode.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {}
      {!isRefreshing && !isRegionSwitching ? (
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={{
            backgroundColor: c.card,
            borderRadius: radii.lg,
            padding: sp.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: sp.sm,
            boxShadow: shadows.card,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: total === 0 ? c.lowSoft : highCount > 0 ? c.highSoft : c.mediumSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons
              name={total === 0 ? 'check-bold' : highCount > 0 ? 'alert-circle' : 'alert'}
              size={20}
              color={total === 0 ? c.riskLow : highCount > 0 ? c.riskHigh : c.riskModerate}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...ty.title, color: c.text, fontWeight: '700' }}>
              {total === 0 ? 'All Clear' : `${total} Active Alert${total === 1 ? '' : 's'}`}
            </Text>
            <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }}>
              {scopeSummary}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {highCount > 0 ? (
              <View
                style={{
                  backgroundColor: c.highSoft,
                  borderRadius: radii.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: c.riskHigh }}>{highCount}</Text>
              </View>
            ) : null}
            {modCount > 0 ? (
              <View
                style={{
                  backgroundColor: c.mediumSoft,
                  borderRadius: radii.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: c.riskModerate }}>{modCount}</Text>
              </View>
            ) : null}
            {lowCount > 0 ? (
              <View
                style={{
                  backgroundColor: c.lowSoft,
                  borderRadius: radii.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: c.riskLow }}>{lowCount}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {}
      <View style={{ gap: sp.xs }}>
        <Text style={{ ...ty.sectionLabel, color: c.textSoft, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
          Subfilters
        </Text>
        <FilterChips options={options} selected={selectedAlertFilter} onSelect={setSelectedAlertFilter} />
      </View>

      {}
      {isRefreshing || isRegionSwitching ? (
        <View style={{ gap: sp.sm }}>
          {[120, 100, 120, 100].map((h, i) => (
            <LoadingSkeleton key={i} height={h} radius={radii.lg} />
          ))}
        </View>
      ) : alerts.length ? (
        grouped.map((group) =>
          group.items.length ? (
            <Animated.View key={group.riskLevel} entering={FadeInDown.duration(300)} style={{ gap: sp.sm }}>
              {}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: sp.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor:
                      group.riskLevel === 'high'
                        ? c.highSoft
                        : group.riskLevel === 'moderate'
                          ? c.mediumSoft
                          : c.lowSoft,
                    borderRadius: radii.pill,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <MaterialCommunityIcons
                    name={riskConfig[group.riskLevel].icon}
                    size={13}
                    color={
                      group.riskLevel === 'high'
                        ? c.riskHigh
                        : group.riskLevel === 'moderate'
                          ? c.riskModerate
                          : c.riskLow
                    }
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color:
                        group.riskLevel === 'high'
                          ? c.riskHigh
                          : group.riskLevel === 'moderate'
                            ? c.riskModerate
                            : c.riskLow,
                    }}
                  >
                    {riskConfig[group.riskLevel].label}
                  </Text>
                  <View
                    style={{
                      backgroundColor:
                        group.riskLevel === 'high'
                          ? c.riskHigh
                          : group.riskLevel === 'moderate'
                            ? c.riskModerate
                            : c.riskLow,
                      borderRadius: 10,
                      minWidth: 18,
                      height: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                      {group.items.length}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
              </View>

              {}
              {group.items.map((item) => (
                <AlertCard
                  key={item.id}
                  item={item}
                  onPress={() => navigation.navigate('AlertDetail', { alert: item })}
                />
              ))}
            </Animated.View>
          ) : null,
        )
      ) : (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            backgroundColor: c.card,
            borderRadius: radii.lg,
            padding: sp.xl,
            gap: sp.md,
            alignItems: 'center',
            boxShadow: shadows.card,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: c.lowSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="check-bold" size={32} color={c.riskLow} />
          </View>
          <Text style={{ ...ty.heading, color: c.text, textAlign: 'center' }}>
            All Clear
          </Text>
          <Text style={{ ...ty.body, color: c.textMuted, textAlign: 'center' }}>
            {emptyStateCopy}
          </Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}
