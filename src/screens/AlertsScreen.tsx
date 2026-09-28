import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AlertCard } from '../components/AlertCard';
import { FilterChips } from '../components/FilterChips';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Text } from '../components/ui/Text';
import { RootStackParamList } from '../navigation/AppNavigator';
import { buildProvinceWideAlerts, buildVisibleAlerts } from '../services/alert-feed-service';
import { useAppStore } from '../state/useAppStore';
import { useAppTheme } from '../theme';
import { CategoryId, RiskLevel } from '../types/alerts';
import { getRiskColor } from '../utils/risk';

type AlertFeedMode = 'relevant' | 'province';

const options: { label: string; value: CategoryId | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Weather', value: 'weather' },
  { label: 'Air', value: 'airQuality' },
  { label: 'Wildfire', value: 'wildfire' },
  { label: 'Water', value: 'water' },
  { label: 'Ticks & mosquitoes', value: 'vectorBorne' },
  { label: 'Health', value: 'healthAdvisories' },
];

const riskConfig: Record<RiskLevel, { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  high: { label: 'High risk', icon: 'alert-octagon' },
  moderate: { label: 'Moderate', icon: 'alert' },
  low: { label: 'For your information', icon: 'information-outline' },
};

export function AlertsScreen() {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const insets = useSafeAreaInsets();
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
  const activeSubRegionLabel = useAppStore((s) => s.activeSubRegionLabel);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];
  const areaLabel = activeSubRegionLabel ?? snapshot.region.label;
  const hasData = snapshot.alerts.weather.source !== 'Waiting for first sync';
  const isInitialized = useAppStore((s) => s.isInitialized);
  const showSkeleton = isRegionSwitching || (!hasData && (isRefreshing || !isInitialized));

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
  const total = alerts.length;

  const summaryTitle =
    total === 0 ? 'All clear' : highCount > 0 ? `${highCount} high-risk alert${highCount === 1 ? '' : 's'}` : `${total} active alert${total === 1 ? '' : 's'}`;
  const summaryBody =
    feedMode === 'province'
      ? 'Across all Manitoba health regions.'
      : locationSource === 'gps'
        ? `Near you in ${areaLabel}.`
        : `For ${areaLabel}.`;
  const summaryTone: RiskLevel = total === 0 ? 'low' : highCount > 0 ? 'high' : modCount > 0 ? 'moderate' : 'low';
  const summaryColor = getRiskColor(summaryTone, c);
  const emptyStateCopy =
    selectedAlertFilter !== 'all'
      ? 'Nothing in this category right now. Try another filter.'
      : feedMode === 'province'
        ? 'No active alerts were found across Manitoba right now.'
        : `Nothing active for ${areaLabel} right now. Check back before you head out.`;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + sp.md,
        paddingHorizontal: sp.md,
        paddingBottom: sp.xxl,
        gap: sp.md,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing && !showSkeleton}
          onRefresh={refreshAll}
          tintColor={c.primary}
          colors={[c.primary]}
          progressBackgroundColor={c.card}
        />
      }
    >
      <ScreenHeader eyebrow={feedMode === 'province' ? 'Manitoba' : areaLabel} title="Alerts" />

      <SegmentedControl
        accessibilityLabel="Alert scope"
        options={[
          { label: 'Near me', value: 'relevant', icon: 'map-marker-radius-outline' },
          { label: 'All Manitoba', value: 'province', icon: 'earth' },
        ]}
        value={feedMode}
        onChange={setFeedMode}
      />

      <FilterChips options={options} selected={selectedAlertFilter} onSelect={setSelectedAlertFilter} />

      {showSkeleton ? (
        <View style={{ gap: sp.sm }}>
          {[84, 150, 150, 130].map((h, i) => (
            <LoadingSkeleton key={i} height={h} radius={radii.lg} />
          ))}
        </View>
      ) : (
        <>
          <Animated.View
            entering={FadeIn.duration(200)}
            accessibilityRole="summary"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: sp.md,
              padding: sp.md,
              borderRadius: radii.lg,
              backgroundColor: summaryTone === 'high' ? c.highSoft : summaryTone === 'moderate' ? c.mediumSoft : c.lowSoft,
            }}
          >
            <MaterialCommunityIcons
              name={total === 0 ? 'check-decagram' : highCount > 0 ? 'alert-octagon' : 'alert'}
              size={30}
              color={summaryColor}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ ...ty.heading, fontSize: 20, lineHeight: 25, color: c.text }}>{summaryTitle}</Text>
              <Text style={{ ...ty.caption, color: c.textMuted }}>{summaryBody}</Text>
            </View>
          </Animated.View>

          {alerts.length ? (
            grouped.map((group) =>
              group.items.length ? (
                <Animated.View key={group.riskLevel} entering={FadeIn.duration(200)} style={{ gap: sp.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: sp.xs }}>
                    <MaterialCommunityIcons
                      name={riskConfig[group.riskLevel].icon}
                      size={16}
                      color={getRiskColor(group.riskLevel, c)}
                    />
                    <Text accessibilityRole="header" style={{ ...ty.sectionLabel, color: getRiskColor(group.riskLevel, c) }}>
                      {riskConfig[group.riskLevel].label} · {group.items.length}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                  </View>

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
            <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: sp.sm, paddingVertical: sp.xl }}>
              <MaterialCommunityIcons name="weather-sunny" size={44} color={c.textSoft} />
              <Text style={{ ...ty.body, color: c.textMuted, textAlign: 'center', maxWidth: 280 }}>{emptyStateCopy}</Text>
            </Animated.View>
          )}
        </>
      )}
    </ScrollView>
  );
}
