import React, { useEffect, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { SafetyScoreCard } from '../components/SafetyScoreCard';
import { CategoryDetailSheet } from '../components/CategoryDetailSheet';
import { SnapshotTile } from '../components/SnapshotTile';
import { TactileButton } from '../components/ui/TactileButton';
import { Text } from '../components/ui/Text';
import { useAppStore } from '../state/useAppStore';
import { useAppTheme } from '../theme';
import { CategoryId } from '../types/alerts';
import { formatRelativeMinutes } from '../utils/format';
import { tapHaptic } from '../utils/haptics';

const categoryOrder: CategoryId[] = ['weather', 'airQuality', 'wildfire', 'water', 'vectorBorne', 'healthAdvisories'];
const DASHBOARD_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DASHBOARD_TIMESTAMP_TICK_MS = 60 * 1000;
const PLACEHOLDER_SOURCE = 'Waiting for first sync';

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

export function OverviewScreen() {
  const isFocused = useIsFocused();
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const insets = useSafeAreaInsets();

  const regionId = useAppStore((state) => state.selectedRegionId);
  const snapshots = useAppStore((state) => state.snapshots);
  const isRefreshing = useAppStore((state) => state.isRefreshing);
  const isOffline = useAppStore((state) => state.isOffline);
  const isRegionSwitching = useAppStore((state) => state.isRegionSwitching);
  const isOutsideManitoba = useAppStore((state) => state.isOutsideManitoba);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const locationSource = useAppStore((state) => state.locationSource);
  const activeSubRegionLabel = useAppStore((state) => state.activeSubRegionLabel);
  const selectedAreaSnapshot = useAppStore((state) => state.selectedAreaSnapshot);
  const refreshAll = useAppStore((state) => state.refreshAll);
  const openRegionPicker = useAppStore((state) => state.openRegionPicker);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];
  const [detailCategory, setDetailCategory] = useState<CategoryId | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  // Only block the page on the very first sync or an area switch; routine refreshes
  // keep the current numbers on screen and use the pull-to-refresh spinner instead.
  // Placeholder snapshots exist before the first sync; never present their numbers as a real score.
  const hasData = snapshot.alerts.weather.source !== PLACEHOLDER_SOURCE;
  const showSkeleton = isRegionSwitching || (!hasData && (isRefreshing || !isInitialized));
  const showNoData = !hasData && !showSkeleton;
  const locationLabel = activeSubRegionLabel ?? snapshot.region.label;
  const todayLabel = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    currentTimeMs,
  );

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

      if (!activeSnapshot || state.isRefreshing || state.isRegionSwitching || !state.isInitialized) {
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

      if (state.isRefreshing || state.isRegionSwitching || !state.isInitialized) {
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
      contentContainerStyle={{
        paddingTop: insets.top + sp.sm,
        paddingHorizontal: sp.md,
        paddingBottom: sp.xxl,
        gap: sp.lg,
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
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp.sm }}>
          <Text style={{ ...ty.caption, color: c.textMuted }}>{todayLabel}</Text>
          <Text style={{ ...ty.caption, color: c.textSoft }}>
            {hasData ? `Updated ${formatRelativeMinutes(snapshot.fetchedAt, currentTimeMs)}` : 'Syncing…'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Current area: ${locationLabel}`}
          accessibilityHint="Opens the area picker"
          onPress={() => {
            tapHaptic();
            openRegionPicker();
          }}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            maxWidth: '100%',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <MaterialCommunityIcons
            name={locationSource === 'gps' ? 'navigation-variant' : 'map-marker'}
            size={22}
            color={c.primary}
          />
          <Text style={{ ...ty.heading, fontSize: 26, lineHeight: 31, color: c.text, flexShrink: 1 }} numberOfLines={1}>
            {locationLabel}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={22} color={c.textMuted} />
        </Pressable>
      </View>

      {isOffline && hasData ? (
        <Banner
          icon="cloud-off-outline"
          tone="high"
          text="Couldn't reach live sources. Showing the last data saved on this phone."
        />
      ) : null}
      {isOutsideManitoba ? (
        <Banner
          icon="map-marker-question-outline"
          tone="info"
          text="You appear to be outside Manitoba, so MOSI is showing the area you picked."
        />
      ) : null}

      {showNoData ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: sp.md, paddingVertical: sp.xxl }}>
          <MaterialCommunityIcons name="cloud-off-outline" size={48} color={c.textSoft} />
          <Text style={{ ...ty.heading, color: c.text, textAlign: 'center' }}>No data yet</Text>
          <Text style={{ ...ty.body, color: c.textMuted, textAlign: 'center', maxWidth: 300 }}>
            MOSI couldn't reach its data sources. Check your connection and try again.
          </Text>
          <TactileButton label="Try again" icon="refresh" loading={isRefreshing} onPress={() => void refreshAll()} />
        </Animated.View>
      ) : showSkeleton ? (
        <View style={{ gap: sp.md }}>
          <LoadingSkeleton height={300} radius={radii.xl} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
            {categoryOrder.map((category) => (
              <LoadingSkeleton key={category} height={138} width="48%" radius={radii.lg} />
            ))}
          </View>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: sp.lg }}>
          <SafetyScoreCard
            riskLevel={snapshot.safetyIndex.overallRisk}
            score={snapshot.safetyIndex.overallScore}
            regionLabel={locationLabel}
            breakdown={snapshot.safetyIndex.breakdown}
          />

          <View style={{ gap: sp.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={{ ...ty.title, fontSize: 19, color: c.text }}>
                What's in the score
              </Text>
              <Text style={{ ...ty.caption, color: c.textSoft }}>Tap for details</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.sm }}>
              {categoryOrder.map((category) => (
                <SnapshotTile
                  key={category}
                  category={category}
                  alert={snapshot.alerts[category]}
                  onPress={() => setDetailCategory(category)}
                />
              ))}
            </View>
          </View>

          <Text style={{ ...ty.caption, color: c.textSoft, textAlign: 'center', paddingHorizontal: sp.md }}>
            MOSI is not a government app. Every source is listed with a link in Settings → Data sources. In an
            emergency, call 911.
          </Text>
        </Animated.View>
      )}

      <CategoryDetailSheet
        category={detailCategory}
        alert={detailCategory ? snapshot.alerts[detailCategory] : null}
        onClose={() => setDetailCategory(null)}
      />
    </ScrollView>
  );
}

function Banner({
  icon,
  text,
  tone,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  tone: 'high' | 'info';
}) {
  const { colors: c, spacing: sp, typography: ty, radii } = useAppTheme();

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp.sm,
        padding: sp.md,
        borderRadius: radii.lg,
        backgroundColor: tone === 'high' ? c.highSoft : c.infoSoft,
      }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={tone === 'high' ? c.riskHigh : c.accent} />
      <Text style={{ ...ty.body, color: c.text, flex: 1 }}>{text}</Text>
    </View>
  );
}
