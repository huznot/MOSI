import React, { useEffect, useState } from 'react';
import { AppState, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { SafetyScoreCard } from '../components/SafetyScoreCard';
import { SnapshotTile } from '../components/SnapshotTile';
import { CATEGORY_META } from '../constants/config';
import { useAppStore } from '../state/useAppStore';
import { useAppTheme } from '../theme';
import { CategoryAlert, CategoryId } from '../types/alerts';
import { formatRelativeMinutes } from '../utils/format';
import { getRiskColor } from '../utils/risk';

const categoryOrder: CategoryId[] = ['weather', 'airQuality', 'wildfire', 'water', 'vectorBorne', 'healthAdvisories'];
const DASHBOARD_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DASHBOARD_TIMESTAMP_TICK_MS = 60 * 1000;

function shouldAutoRefreshDashboard(fetchedAt?: string | null) {
  if (!fetchedAt) {
    return true;
  }

  const fetchedAtMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedAtMs)) {
    return true;
  }

  return Date.now() - fetchedAtMs >= DASHBOARD_AUTO_REFRESH_INTERVAL_MS;
}

function getLiveValue(category: CategoryId, alert: CategoryAlert): string {
  const value = alert.value;

  switch (category) {
    case 'weather': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `${Math.round(value)}C`;
      }

      const match = alert.summary.match(/-?\d+/);
      return match ? `${match[0]}C` : '--';
    }
    case 'airQuality': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toFixed(1);
      }

      if (typeof value === 'string' && value !== 'n/a') {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) {
          return parsed.toFixed(1);
        }
      }

      return '--';
    }
    case 'wildfire': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value).toString();
      }

      return '0';
    }
    case 'water': {
      if (alert.riskLevel === 'low') {
        return '0';
      }

      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value).toString();
      }

      return '0';
    }
    case 'vectorBorne': {
      if (alert.riskLevel === 'high') return 'Active';
      if (alert.riskLevel === 'moderate') return 'Building';
      return 'Low';
    }
    case 'healthAdvisories': {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value).toString();
      }

      return '0';
    }
    default:
      return '--';
  }
}

function getLiveLabel(category: CategoryId): string {
  switch (category) {
    case 'weather':
      return 'C';
    case 'airQuality':
      return 'AQHI';
    case 'wildfire':
      return 'fires';
    case 'water':
      return 'advisories';
    case 'vectorBorne':
      return 'season';
    case 'healthAdvisories':
      return 'bulletins';
    default:
      return '';
  }
}

export function OverviewScreen() {
  const isFocused = useIsFocused();
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii, shadows } = theme;

  const regionId = useAppStore((state) => state.selectedRegionId);
  const snapshots = useAppStore((state) => state.snapshots);
  const isRefreshing = useAppStore((state) => state.isRefreshing);
  const isOffline = useAppStore((state) => state.isOffline);
  const isRegionSwitching = useAppStore((state) => state.isRegionSwitching);
  const locationSource = useAppStore((state) => state.locationSource);
  const activeSubRegionLabel = useAppStore((state) => state.activeSubRegionLabel);
  const selectedAreaSnapshot = useAppStore((state) => state.selectedAreaSnapshot);
  const refreshAll = useAppStore((state) => state.refreshAll);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];
  const [expandedCategory, setExpandedCategory] = useState<CategoryId | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const showSkeleton = isRefreshing || isRegionSwitching;

  const locationLabel =
    locationSource === 'gps' && activeSubRegionLabel ? activeSubRegionLabel : snapshot.region.label;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    setCurrentTimeMs(Date.now());

    const intervalId = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DASHBOARD_TIMESTAMP_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const refreshIfStale = () => {
      const state = useAppStore.getState();
      const activeSnapshot = state.selectedAreaSnapshot ?? state.snapshots[state.selectedRegionId];

      if (!activeSnapshot || state.isRefreshing || state.isRegionSwitching) {
        return;
      }

      if (!shouldAutoRefreshDashboard(activeSnapshot.fetchedAt)) {
        return;
      }

      void state.refreshAll();
    };

    refreshIfStale();

    const intervalId = setInterval(() => {
      const state = useAppStore.getState();

      if (state.isRefreshing || state.isRegionSwitching) {
        return;
      }

      void state.refreshAll();
    }, DASHBOARD_AUTO_REFRESH_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshIfStale();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [isFocused]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={c.primary} />}
    >
      <View
        style={{
          paddingHorizontal: sp.md,
          paddingTop: sp.lg,
          paddingBottom: sp.sm,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: c.cardSecondary,
            borderRadius: radii.pill,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <MaterialCommunityIcons
            name={locationSource === 'gps' ? 'crosshairs-gps' : 'map-marker-outline'}
            size={13}
            color={c.primary}
          />
          <Text style={{ ...ty.caption, color: c.text, fontWeight: '700' }}>{locationLabel}</Text>
          {locationSource === 'gps' && activeSubRegionLabel ? (
            <Text style={{ ...ty.caption, color: c.textMuted }}> / {snapshot.region.label}</Text>
          ) : null}
        </View>
        <Text style={{ ...ty.caption, color: c.textMuted }}>
          {formatRelativeMinutes(snapshot.fetchedAt, currentTimeMs)}
        </Text>
      </View>

      <View style={{ paddingHorizontal: sp.md, gap: sp.lg }}>
        {isOffline ? (
          <View style={{ backgroundColor: c.highSoft, borderRadius: radii.lg, padding: sp.md }}>
            <Text style={{ ...ty.body, color: c.riskHigh }}>
              Live sources unavailable. Showing cached data.
            </Text>
          </View>
        ) : null}

        {showSkeleton ? (
          <View style={{ gap: sp.sm }}>
            <LoadingSkeleton height={312} radius={28} />
            <View style={{ flexDirection: 'row', gap: sp.sm }}>
              {categoryOrder.slice(0, 4).map((category) => (
                <LoadingSkeleton key={category} height={90} width={80} radius={radii.lg} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
              {categoryOrder.map((category) => (
                <LoadingSkeleton key={category} height={160} width="48%" radius={radii.lg} />
              ))}
            </View>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(280)} style={{ gap: sp.xl }}>
            <SafetyScoreCard
              riskLevel={snapshot.safetyIndex.overallRisk}
              score={snapshot.safetyIndex.overallScore}
              regionLabel={snapshot.region.label}
              breakdown={snapshot.safetyIndex.breakdown}
            />

            <View style={{ gap: sp.sm }}>
              <Text
                style={{
                  ...ty.sectionLabel,
                  color: c.textSoft,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontSize: 10,
                  fontWeight: '700',
                }}
              >
                Live Conditions
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: sp.sm }}
              >
                {categoryOrder.map((category, index) => {
                  const alert = snapshot.alerts[category];
                  const accent = getRiskColor(alert.riskLevel, c);
                  const value = getLiveValue(category, alert);
                  const label = getLiveLabel(category);

                  return (
                    <Animated.View
                      key={category}
                      entering={FadeInRight.duration(300).delay(index * 55)}
                      style={{
                        backgroundColor: c.card,
                        borderRadius: radii.lg,
                        paddingHorizontal: sp.md,
                        paddingVertical: sp.md,
                        alignItems: 'center',
                        gap: 5,
                        minWidth: 82,
                        boxShadow: shadows.card,
                        borderTopWidth: 3,
                        borderTopColor: accent,
                      }}
                    >
                      <MaterialCommunityIcons
                        name={CATEGORY_META[category].icon as never}
                        size={22}
                        color={accent}
                      />
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: '800',
                          color: c.text,
                          lineHeight: 24,
                          letterSpacing: -0.5,
                        }}
                      >
                        {value}
                      </Text>
                      <Text style={{ ...ty.caption, color: c.textMuted, textAlign: 'center', fontSize: 10 }}>
                        {label}
                      </Text>
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: accent,
                          marginTop: 1,
                        }}
                      />
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={{ gap: sp.sm }}>
              <Text
                style={{
                  ...ty.sectionLabel,
                  color: c.textSoft,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontSize: 10,
                  fontWeight: '700',
                }}
              >
                Category Breakdown
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
                {categoryOrder.map((category, categoryIndex) => (
                  <SnapshotTile
                    key={category}
                    category={category}
                    alert={snapshot.alerts[category]}
                    expanded={expandedCategory === category}
                    index={categoryIndex}
                    onPress={() => {
                      setExpandedCategory((current) => (current === category ? null : category));
                    }}
                  />
                ))}
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}
