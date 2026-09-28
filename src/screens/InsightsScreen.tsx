import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/ui/Text';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ui/ScreenHeader';

import { ForecastStrip } from '../components/ForecastStrip';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { TrendSparkline } from '../components/TrendSparkline';
import { CATEGORY_META } from '../constants/config';
import { useAppStore } from '../state/useAppStore';
import { PREDICTION_MODEL_VERSION } from '../services/predictionService';
import { useAppTheme } from '../theme';
import { CategoryId, RiskLevel } from '../types/alerts';
import { formatRiskLevel, formatTemperature } from '../utils/format';
import { getRiskColor, toDisplayedMosiScore } from '../utils/risk';

const categoryOrder: CategoryId[] = ['weather', 'airQuality', 'wildfire', 'vectorBorne', 'water', 'healthAdvisories'];

const CATEGORY_DRIVER_INDEX: Record<CategoryId, number> = {
  weather: 0,
  airQuality: 1,
  wildfire: 2,
  vectorBorne: 3,
  water: 4,
  healthAdvisories: 4,
};

const MOSI_EXPLANATION =
  'The MOSI score is shown on a 0.0 to 3.0 scale.\n\n0.0-0.9 Low risk. Routine outdoor precautions are usually enough.\n0.9-2.0 Moderate risk. Sensitive groups should take extra precautions.\n2.0-3.0 High risk. Conditions can present a significant health or environmental hazard.\n\nThe score combines six categories: weather, air quality, wildfire, water, vector-borne, and health advisories.';

const CONFIDENCE_EXPLANATION =
  'Confidence depends on how far ahead the forecast goes.\n\nDays 1-2 usually have the strongest confidence.\nDays 3-5 are useful for direction, but accuracy starts to decline.\nDays 6-7 should be treated as a general outlook.\n\nAir quality remains more uncertain because sudden smoke or pollution events cannot be predicted reliably.';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function toPressurePercent(value: number) {
  return Math.round(((value - 1) / 2) * 100);
}

function formatDetailDate(isoDate: string | null | undefined) {
  if (!isoDate) return 'Unavailable';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

type InfoModalState = { title: string; body: string } | null;

function InfoModal({ modal, onClose }: { modal: InfoModalState; onClose: () => void }) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, radii, typography: ty } = theme;

  return (
    <Modal visible={!!modal} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: sp.xl,
            gap: sp.md,
            paddingBottom: sp.xxxl,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              width: 36,
              height: 4,
              backgroundColor: c.divider,
              borderRadius: 2,
              alignSelf: 'center',
              marginBottom: sp.sm,
            }}
          />
          <Text style={{ ...ty.heading, color: c.text }}>{modal?.title}</Text>
          <Text selectable style={{ ...ty.body, color: c.textMuted, lineHeight: 22 }}>
            {modal?.body}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: sp.sm,
              backgroundColor: c.primary,
              borderRadius: radii.pill,
              paddingVertical: sp.sm,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...ty.bodyStrong, color: '#fff' }}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionHeader({ label, onInfo }: { label: string; onInfo?: () => void }) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty } = theme;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.xs }}>
      <Text
        style={{
          ...ty.sectionLabel,
          color: c.textSoft,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: 11,
          fontWeight: '700',
          flex: 1,
        }}
      >
        {label}
      </Text>
      {onInfo ? (
        <TouchableOpacity onPress={onInfo} hitSlop={12}>
          <MaterialCommunityIcons name="information-outline" size={15} color={c.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function CategoryArc({
  category,
  pressure,
  riskLevel,
  delay = 0,
  onPress,
}: {
  category: CategoryId;
  pressure: number;
  riskLevel: RiskLevel;
  delay?: number;
  onPress?: () => void;
}) {
  const theme = useAppTheme();
  const accent = getRiskColor(riskLevel, theme.colors);
  const SIZE = 68;
  const STROKE = 5;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const prog = useSharedValue(0);

  useEffect(() => {
    prog.value = withTiming(pressure / 100, {
      duration: 950,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressure, prog]);

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - prog.value * CIRC,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ alignItems: 'center', gap: 4, flex: 1 }}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1} style={{ alignItems: 'center', gap: 4 }}>
        <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={theme.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}
              strokeWidth={STROKE}
              fill="none"
            />
            <AnimatedCircle
              animatedProps={animProps}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              rotation="-90"
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          </Svg>
          <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={22} color={accent} />
        </View>
        {}
        <Text style={{ fontSize: 11, fontWeight: '800', color: accent, lineHeight: 14 }}>
          {formatRiskLevel(riskLevel).toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text
            style={{
              fontSize: 11,
              color: theme.colors.textMuted,
              textAlign: 'center',
              lineHeight: 13,
            }}
          >
            {CATEGORY_META[category].shortLabel}
          </Text>
          {onPress ? (
            <MaterialCommunityIcons name="information-outline" size={10} color={theme.colors.textMuted} />
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function DriverCard({ title, detail }: { title: string; detail: string }) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, radii, typography: ty } = theme;
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={{
        backgroundColor: c.cardSecondary,
        borderRadius: radii.md,
        overflow: 'hidden',
      }}
    >
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: sp.md,
        }}
      >
        <Text style={{ ...ty.bodyStrong, color: c.text, flex: 1 }}>{title}</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={c.textMuted}
        />
      </TouchableOpacity>
      {expanded ? (
        <View
          style={{
            paddingHorizontal: sp.md,
            paddingBottom: sp.md,
            borderTopWidth: 1,
            borderTopColor: c.divider,
          }}
        >
          <Text selectable style={{ ...ty.body, color: c.textMuted, lineHeight: 22, paddingTop: sp.sm }}>
            {detail}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function InsightsScreen() {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii, shadows } = theme;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const regionId = useAppStore((s) => s.selectedRegionId);
  const selectedSubRegionId = useAppStore((s) => s.selectedSubRegionId);
  const snapshots = useAppStore((s) => s.snapshots);
  const selectedAreaSnapshot = useAppStore((s) => s.selectedAreaSnapshot);
  const predictionByRegion = useAppStore((s) => s.predictionByRegion);
  const ensurePredictionForRegion = useAppStore((s) => s.ensurePredictionForRegion);
  const isPredictionRefreshing = useAppStore((s) => s.isPredictionRefreshing);
  const isRegionSwitching = useAppStore((s) => s.isRegionSwitching);
  const locationSource = useAppStore((s) => s.locationSource);
  const activeArea = useAppStore((s) => s.activeArea);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];
  const predictionKey = selectedSubRegionId ?? (locationSource === 'gps' && activeArea ? activeArea.id : regionId);
  const prediction = predictionByRegion[predictionKey];
  const visibleForecastDays = prediction?.days.slice(1) ?? [];
  const [selectedDayIsoDate, setSelectedDayIsoDate] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<InfoModalState>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const toggleAbout = useCallback(() => setAboutExpanded((v) => !v), []);
  const closeModal = useCallback(() => setInfoModal(null), []);
  const defaultForecastDay = visibleForecastDays[0] ?? prediction?.days[0] ?? null;

  useEffect(() => {
    if (defaultForecastDay?.isoDate) {
      setSelectedDayIsoDate((cur) =>
        cur && visibleForecastDays.some((day) => day.isoDate === cur) ? cur : defaultForecastDay.isoDate,
      );
    }
  }, [defaultForecastDay, visibleForecastDays]);

  useEffect(() => {
    if (!prediction || prediction.modelVersion !== PREDICTION_MODEL_VERSION) {
      void ensurePredictionForRegion(regionId);
    }
  }, [ensurePredictionForRegion, prediction, regionId]);

  const selectedDay = useMemo(
    () => visibleForecastDays.find((d) => d.isoDate === selectedDayIsoDate) ?? defaultForecastDay,
    [defaultForecastDay, selectedDayIsoDate, visibleForecastDays],
  );
  const selectedDetail = selectedDay && prediction?.dayDetails ? prediction.dayDetails[selectedDay.isoDate] : null;
  const overallAccent = getRiskColor(selectedDay?.riskLevel ?? 'low', c);
  const chartWidth = Math.max(240, width - sp.md * 2 - sp.md * 2);

  const getChartColor = (label: string) => {
    if (label.startsWith('Overall')) return overallAccent;
    if (label.startsWith('High Temp') || label.startsWith('Low Temp')) return c.primary;
    if (label.startsWith('Air')) return c.riskModerate;
    if (label.startsWith('Wildfire')) return c.riskHigh;
    return c.riskLow;
  };

  const dayLabels = visibleForecastDays.map((d) => d.label);
  const selectedDayIndex = visibleForecastDays.findIndex((d) => d.isoDate === selectedDay?.isoDate);
  const trendStartLabel = visibleForecastDays[0]?.label ?? 'Next day';
  const forecastHeading = visibleForecastDays.length ? `Next ${visibleForecastDays.length} Days` : 'Forecast';

  const getFormatValue = (label: string) => {
    if (label.startsWith('High Temp') || label.startsWith('Low Temp')) {
      return (v: number) => `${Math.round(v)}C`;
    }
    if (label.startsWith('Overall') || label.includes('Risk (0-3)')) {
      return (v: number) => v.toFixed(1);
    }
    return undefined;
  };

  const locationLabel = activeArea
    ? `${activeArea.shortLabel} | ${snapshot.region.label}`
    : snapshot.region.label;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: sp.md,
        paddingTop: insets.top + sp.md,
        paddingBottom: sp.xxl,
        gap: sp.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      {}
      <InfoModal modal={infoModal} onClose={closeModal} />

      {}
      <ScreenHeader
        eyebrow={locationLabel}
        title={forecastHeading}
        subtitle="Tap a day for its breakdown, and a gauge to learn what it measures."
      />

      {prediction && !isRegionSwitching ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: sp.lg }}>
          {}
          <ForecastStrip
            days={visibleForecastDays}
            selectedIsoDate={selectedDay?.isoDate}
            onSelect={setSelectedDayIsoDate}
          />

          {}
          {selectedDay && selectedDetail ? (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: radii.lg,
                overflow: 'hidden',
                boxShadow: shadows.card,
              }}
            >
              {}
              <View style={{ height: 4, backgroundColor: overallAccent }} />

              <View style={{ padding: sp.lg, gap: sp.lg }}>
                {}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ ...ty.sectionLabel, color: c.textSoft, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
                    {formatDetailDate(selectedDay.isoDate)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setInfoModal({ title: 'Forecast Confidence', body: CONFIDENCE_EXPLANATION })}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: c.cardSecondary,
                      borderRadius: radii.pill,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }}>
                      {selectedDetail.confidenceLabel}
                    </Text>
                    <MaterialCommunityIcons name="information-outline" size={11} color={c.textMuted} />
                  </TouchableOpacity>
                </View>

                {}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: sp.lg,
                    backgroundColor: c.cardSecondary,
                    borderRadius: radii.md,
                    padding: sp.md,
                  }}
                >
                  {}
                  <TouchableOpacity
                    onPress={() => setInfoModal({ title: 'What is the MOSI Score?', body: MOSI_EXPLANATION })}
                    activeOpacity={0.75}
                    style={{ alignItems: 'center', minWidth: 80 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                      <Text
                        style={{
                          fontSize: 52,
                          fontWeight: '800',
                          color: overallAccent,
                          lineHeight: 56,
                          letterSpacing: -2,
                        }}
                      >
                        {toDisplayedMosiScore(selectedDay.score).toFixed(1)}
                      </Text>
                      <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 12 }}>/3</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }}>MOSI</Text>
                      <MaterialCommunityIcons name="information-outline" size={10} color={c.textMuted} />
                    </View>
                  </TouchableOpacity>

                  <View style={{ width: 1, height: 50, backgroundColor: c.divider }} />

                  {}
                  <View style={{ flex: 1, gap: 8 }}>
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: `${overallAccent}22`,
                        borderRadius: radii.pill,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ ...ty.caption, color: overallAccent, fontWeight: '800', fontSize: 11 }}>
                        {formatRiskLevel(selectedDay.riskLevel).toUpperCase()} RISK
                      </Text>
                    </View>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, letterSpacing: -0.5 }}>
                      {formatTemperature(selectedDay.highC)}
                      <Text style={{ color: c.textMuted, fontWeight: '400', fontSize: 16 }}>
                        {' '}/ {formatTemperature(selectedDay.lowC)}
                      </Text>
                    </Text>
                    <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }} numberOfLines={1}>
                      {selectedDetail.headline}
                    </Text>
                  </View>
                </View>

                {}
                <View
                  style={{
                    backgroundColor: `${overallAccent}12`,
                    borderRadius: radii.md,
                    padding: sp.md,
                    borderLeftWidth: 3,
                    borderLeftColor: overallAccent,
                  }}
                >
                  <Text style={{ ...ty.caption, color: c.textSoft, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
                    What this means
                  </Text>
                  <Text selectable style={{ ...ty.body, color: c.text, lineHeight: 20 }}>
                    {selectedDetail.narrative}
                  </Text>
                </View>

                {}
                <View style={{ gap: sp.sm }}>
                  <SectionHeader
                    label="Category Pressure"
                    onInfo={() =>
                      setInfoModal({
                        title: 'Category Pressure',
                        body: 'Each ring shows how elevated that category is right now.\n\nThe ring fills from empty at 0.0 to full at 3.0.\n\nTap any ring to see what is driving that category.',
                      })
                    }
                  />
                  <View style={{ flexDirection: 'row', gap: sp.sm }}>
                    {categoryOrder.slice(0, 3).map((cat, i) => (
                      <CategoryArc
                        key={cat}
                        category={cat}
                        pressure={toPressurePercent(selectedDetail.categoryScores[cat])}
                        riskLevel={selectedDetail.categoryRiskLevels[cat]}
                        delay={i * 70}
                        onPress={() => {
                          const driver = selectedDetail.drivers[CATEGORY_DRIVER_INDEX[cat]];
                          const live = snapshot.alerts[cat];
                          const liveDetails = live.details?.length
                            ? `\n\nCurrent advisories:\n- ${live.details.join('\n- ')}`
                            : '';
                          setInfoModal({
                            title: `Why is ${CATEGORY_META[cat].label} ${formatRiskLevel(selectedDetail.categoryRiskLevels[cat])}?`,
                            body: `${driver?.detail ?? 'No forecast detail available.'}\n\nCurrent conditions: ${live.summary}${liveDetails}`,
                          });
                        }}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: sp.sm }}>
                    {categoryOrder.slice(3).map((cat, i) => (
                      <CategoryArc
                        key={cat}
                        category={cat}
                        pressure={toPressurePercent(selectedDetail.categoryScores[cat])}
                        riskLevel={selectedDetail.categoryRiskLevels[cat]}
                        delay={(i + 3) * 70}
                        onPress={() => {
                          const driver = selectedDetail.drivers[CATEGORY_DRIVER_INDEX[cat]];
                          const live = snapshot.alerts[cat];
                          const liveDetails = live.details?.length
                            ? `\n\nCurrent advisories:\n- ${live.details.join('\n- ')}`
                            : '';
                          setInfoModal({
                            title: `Why is ${CATEGORY_META[cat].label} ${formatRiskLevel(selectedDetail.categoryRiskLevels[cat])}?`,
                            body: `${driver?.detail ?? 'No forecast detail available.'}\n\nCurrent conditions: ${live.summary}${liveDetails}`,
                          });
                        }}
                      />
                    ))}
                  </View>
                </View>

                {}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    backgroundColor: c.cardSecondary,
                    borderRadius: radii.md,
                    padding: sp.sm,
                    paddingHorizontal: sp.md,
                  }}
                >
                  {(['low', 'moderate', 'high'] as RiskLevel[]).map((level) => (
                    <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          backgroundColor: getRiskColor(level, c),
                        }}
                      />
                      <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }}>
                        {formatRiskLevel(level)}{' '}
                        <Text style={{ color: c.textSoft }}>
                          {level === 'low' ? '0.0-0.9' : level === 'moderate' ? '0.9-2.0' : '2.0-3.0'}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>

                {}
                {selectedDetail.drivers.length > 0 ? (
                  <View style={{ gap: sp.sm }}>
                    <SectionHeader
                      label="What's Driving It"
                      onInfo={() =>
                        setInfoModal({
                          title: "What's Driving It",
                          body: 'Each card explains one piece of the MOSI score. Tap a card to expand the full explanation of how that score was calculated and what scientific sources it uses.',
                        })
                      }
                    />
                    {selectedDetail.drivers.map((driver) => (
                      <DriverCard key={driver.title} title={driver.title} detail={driver.detail} />
                    ))}
                  </View>
                ) : null}

                {}
                {selectedDetail.chartSeries.length > 0 ? (
                  <View style={{ gap: sp.sm }}>
                    <SectionHeader
                      label="Forecast Trends"
                      onInfo={() =>
                        setInfoModal({
                          title: 'Forecast Trends',
                          body: 'These charts show how each variable is expected to change from tomorrow onward.\n\nRisk scores use the app\'s 0-3 display scale. Temperature tracks the forecast high and low. All values come from the current forecast model.\n\nThe left side starts with tomorrow and the right side shows the end of the visible forecast window.',
                        })
                      }
                    />
                    <View style={{ gap: sp.md }}>
                      {selectedDetail.chartSeries.map((series) => (
                        <View
                          key={series.label}
                          style={{
                            backgroundColor: c.cardSecondary,
                            borderRadius: radii.md,
                            padding: sp.md,
                            gap: sp.sm,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 4,
                                  backgroundColor: getChartColor(series.label),
                                }}
                              />
                              <Text style={{ ...ty.caption, color: c.text, fontWeight: '700', fontSize: 11 }}>
                                {series.label}
                              </Text>
                            </View>
                            <Text style={{ ...ty.caption, color: c.textMuted, fontSize: 11 }}>
                              {trendStartLabel} onward
                            </Text>
                          </View>
                          <TrendSparkline
                            values={series.values.slice(1)}
                            dayLabels={dayLabels}
                            width={chartWidth - sp.md * 2}
                            height={90}
                            color={getChartColor(series.label)}
                            showAxisLabels
                            formatValue={getFormatValue(series.label)}
                            highlightIndex={selectedDayIndex >= 0 ? selectedDayIndex : 0}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {}
                {prediction.about?.length ? (
                  <View style={{ gap: sp.sm }}>
                    <TouchableOpacity
                      onPress={toggleAbout}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={{
                          ...ty.sectionLabel,
                          color: c.textSoft,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        About This Model
                      </Text>
                      <MaterialCommunityIcons
                        name={aboutExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={c.textMuted}
                      />
                    </TouchableOpacity>
                    {aboutExpanded ? (
                      <View
                        style={{
                          backgroundColor: c.cardSecondary,
                          borderRadius: radii.md,
                          padding: sp.md,
                          gap: sp.sm,
                        }}
                      >
                        {prediction.about.map((bullet, i) => (
                          <View key={i} style={{ flexDirection: 'row', gap: sp.sm }}>
                            <Text style={{ ...ty.caption, color: c.primary, fontWeight: '700', fontSize: 11 }}>
                              -
                            </Text>
                            <Text
                              selectable
                              style={{ ...ty.caption, color: c.textMuted, fontSize: 11, flex: 1, lineHeight: 16 }}
                            >
                              {bullet}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={{ gap: sp.sm }}>
          <LoadingSkeleton height={120} radius={radii.lg} />
          <LoadingSkeleton height={380} radius={radii.lg} />
          {isPredictionRefreshing ? (
            <Text style={{ ...ty.body, color: c.textMuted }}>
              Loading forecast for {snapshot.region.label}...
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
