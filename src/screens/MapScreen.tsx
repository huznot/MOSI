import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/ui/Text';
import MapView, { Circle, Marker, Polygon, type LatLng } from 'react-native-maps';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_META, MANITOBA_MAP_REGION, MANITOBA_REGIONS } from '../constants/config';
import { getPolygonBounds, getPolygonCentroid, pointInPolygon } from '../data/manitobaGeometry';
import { MANITOBA_SUB_REGIONS } from '../data/manitobaSubRegions';
import { MapMarker } from '../components/MapMarker';
import {
  BEACH_ALGAE_GUIDELINE,
  BEACH_ECOLI_GUIDELINE,
  BEACH_MICROCYSTIN_GUIDELINE,
  algaeRadiusMetres,
  BeachMetricStatus,
  BeachStatusTone,
  ecoliRadiusMetres,
  getBeachAlgaeStatus,
  getBeachEcoliStatus,
  getBeachMicrocystinStatus,
  getBeachOverallStatus,
} from '../services/beachMonitoringService';
import { getDistanceKm } from '../services/locationService';
import { calculateSafetyIndex } from '../services/safetyIndex';
import { waterAreaIntersectsPolygon } from '../services/waterAdvisoryService';
import { useAppStore } from '../state/useAppStore';
import { useAppTheme } from '../theme';
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../theme/mapStyles';
import { AlertDetail, BeachMonitoringPoint, CategoryAlert, HydroOutage, MbReadyAlert, RegionCoordinate, RegionId, RegionSnapshot, RiskLevel } from '../types/alerts';
import { formatRiskLevel } from '../utils/format';
import { getRiskColor, normalizeMosiScore, toDisplayedMosiScore } from '../utils/risk';

const MINI_RING_SIZE = 76;
const MINI_RING_STROKE = 8;
const MINI_RING_RADIUS = (MINI_RING_SIZE - MINI_RING_STROKE) / 2;
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_RING_RADIUS;

const BEACH_CLEAR_FILL = '#52B788';
const BEACH_ADVISORY_FILL = '#E9A800';
const BEACH_WARNING_FILL = '#E63946';
const BEACH_WARNING_AREA_FILL = 'rgba(230, 57, 70, 0.18)';
const BEACH_WARNING_AREA_STROKE = 'rgba(230, 57, 70, 0.72)';
const WATER_SITE_FILL = '#D97706';
const WATER_SITE_STROKE = '#FFFFFF';
const PUBLIC_WATER_FILL = '#B91C1C';
const PUBLIC_WATER_AREA_FILL = 'rgba(185, 28, 28, 0.14)';
const PUBLIC_WATER_AREA_STROKE = 'rgba(185, 28, 28, 0.5)';
const LOCAL_WATER_AREA_FILL = 'rgba(217, 119, 6, 0.14)';
const LOCAL_WATER_AREA_STROKE = 'rgba(217, 119, 6, 0.45)';
const WILDFIRE_FILL = '#DC2626';

const MB_READY_FILL = 'rgba(217, 119, 6, 0.16)';
const MB_READY_STROKE = 'rgba(217, 119, 6, 0.72)';
const MB_READY_MARKER = '#D97706';

const MB_READY_HIGH_FILL = 'rgba(234, 88, 12, 0.18)';
const MB_READY_HIGH_STROKE = 'rgba(234, 88, 12, 0.75)';
const MB_READY_HIGH_MARKER = '#EA580C';

const HYDRO_FILL = 'rgba(202, 138, 4, 0.14)';
const HYDRO_STROKE = 'rgba(202, 138, 4, 0.68)';
const HYDRO_MARKER = '#CA8A04';
const MAP_MODAL_ENTER = FadeIn.duration(200);
const MAP_MODAL_EXIT = FadeOut.duration(150);
const MAP_MODAL_BACKDROP_ENTER = FadeIn.duration(180);
const MAP_MODAL_BACKDROP_EXIT = FadeOut.duration(160);

function getBeachToneColor(tone: BeachStatusTone, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (tone === 'warning') {
    return colors.riskHigh;
  }

  if (tone === 'advisory') {
    return colors.riskModerate;
  }

  return colors.riskLow;
}

function getBeachMarkerColor(tone: BeachStatusTone) {
  if (tone === 'warning') {
    return BEACH_WARNING_FILL;
  }

  if (tone === 'advisory') {
    return BEACH_ADVISORY_FILL;
  }

  return BEACH_CLEAR_FILL;
}

function getBeachMarkerIcon(tone: BeachStatusTone) {
  if (tone === 'warning') {
    return 'close-thick';
  }

  if (tone === 'advisory') {
    return 'alert';
  }

  return 'check';
}

function toLatLngCoordinates(coordinates: readonly RegionCoordinate[]): LatLng[] {
  return coordinates.map((coordinate) => ({
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  }));
}

function toCirclePolygon(center: RegionCoordinate, radiusMetres: number, vertexCount = 40): LatLng[] {
  const latitudeRadius = radiusMetres / 111_320;
  const longitudeRadius = radiusMetres / (111_320 * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));

  return Array.from({ length: vertexCount }, (_, index) => {
    const angle = (index / vertexCount) * Math.PI * 2;

    return {
      latitude: center.latitude + latitudeRadius * Math.sin(angle),
      longitude: center.longitude + longitudeRadius * Math.cos(angle),
    };
  });
}

const REGION_POLYGON_COORDINATES = Object.fromEntries(
  MANITOBA_REGIONS.map((region) => [region.id, toLatLngCoordinates(region.polygon)]),
) as Record<RegionId, LatLng[]>;

const SUB_REGION_POLYGON_COORDINATES = Object.fromEntries(
  MANITOBA_SUB_REGIONS.map((subRegion) => [subRegion.id, toLatLngCoordinates(subRegion.polygon)]),
) as Record<string, LatLng[]>;

function findZoneForTap(parentRegionId: RegionId, tapPoint: RegionCoordinate) {
  const exactZone = MANITOBA_SUB_REGIONS.find(
    (zone) =>
      zone.parentRegionId === parentRegionId && pointInPolygon(tapPoint.latitude, tapPoint.longitude, zone.polygon),
  );
  if (exactZone) {
    return exactZone;
  }

  return MANITOBA_SUB_REGIONS
    .filter((zone) => zone.parentRegionId === parentRegionId)
    .sort(
      (left, right) =>
        getDistanceKm(
          tapPoint.latitude,
          tapPoint.longitude,
          left.center.latitude,
          left.center.longitude,
        ) -
        getDistanceKm(
          tapPoint.latitude,
          tapPoint.longitude,
          right.center.latitude,
          right.center.longitude,
        ),
    )[0];
}

function hexToRgba(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function boundsToMapRegion(
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  paddingRatio = 0.24,
  minimumLatitudeDelta = 0.22,
  minimumLongitudeDelta = 0.22,
) {
  const latitudeSpan = Math.max(bounds.maxLat - bounds.minLat, minimumLatitudeDelta);
  const longitudeSpan = Math.max(bounds.maxLon - bounds.minLon, minimumLongitudeDelta);

  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLon + bounds.maxLon) / 2,
    latitudeDelta: latitudeSpan * (1 + paddingRatio),
    longitudeDelta: longitudeSpan * (1 + paddingRatio),
  };
}

function MiniScoreRing({ riskLevel, score }: { riskLevel: RiskLevel; score: number }) {
  const theme = useAppTheme();
  const accent = getRiskColor(riskLevel, theme.colors);
  const progress = normalizeMosiScore(score);
  const scoreLabel = Number.isFinite(score) ? toDisplayedMosiScore(score).toFixed(1) : '--';

  return (
    <View style={{ width: MINI_RING_SIZE, height: MINI_RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={MINI_RING_SIZE} height={MINI_RING_SIZE} style={{ position: 'absolute' }}>
        <SvgCircle
          cx={MINI_RING_SIZE / 2}
          cy={MINI_RING_SIZE / 2}
          r={MINI_RING_RADIUS}
          stroke={theme.colors.divider}
          strokeWidth={MINI_RING_STROKE}
          fill="none"
        />
        <SvgCircle
          cx={MINI_RING_SIZE / 2}
          cy={MINI_RING_SIZE / 2}
          r={MINI_RING_RADIUS}
          stroke={accent}
          strokeWidth={MINI_RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${MINI_RING_CIRCUMFERENCE} ${MINI_RING_CIRCUMFERENCE}`}
          strokeDashoffset={MINI_RING_CIRCUMFERENCE - progress * MINI_RING_CIRCUMFERENCE}
          rotation="-90"
          origin={`${MINI_RING_SIZE / 2}, ${MINI_RING_SIZE / 2}`}
        />
      </Svg>
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
          {scoreLabel}
        </Text>
        <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, fontSize: 11 }}>
          / 3
        </Text>
      </View>
    </View>
  );
}

function formatAlertDate(value?: string | number | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function toSortableAlertTime(value?: string | number | null) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortAlertDetails(left: AlertDetail, right: AlertDetail) {
  const severityOrder: Record<RiskLevel, number> = {
    high: 0,
    moderate: 1,
    low: 2,
  };

  const severityDelta = severityOrder[left.riskLevel] - severityOrder[right.riskLevel];
  return severityDelta !== 0 ? severityDelta : toSortableAlertTime(right.updatedAt) - toSortableAlertTime(left.updatedAt);
}

function getMapAlertMarkerStyle(alert: AlertDetail) {
  if (alert.category === 'wildfire') {
    return {
      fill: WILDFIRE_FILL,
      icon: 'fire' as const,
      size: 24,
      iconSize: 12,
    };
  }

  if (alert.riskLevel === 'high') {
    return {
      fill: PUBLIC_WATER_FILL,
      icon: 'water-alert' as const,
      size: 22,
      iconSize: 11,
    };
  }

  return {
    fill: WATER_SITE_FILL,
    icon: 'water-outline' as const,
    size: 20,
    iconSize: 11,
  };
}

function getWaterNeutralOverallRisk(snapshot: RegionSnapshot) {
  return calculateSafetyIndex({
    ...snapshot.alerts,
    water: {
      ...snapshot.alerts.water,
      riskLevel: 'low',
    },
  }).overallRisk;
}

function getWaterSiteGroupKey(alert: AlertDetail) {
  const normalizedTitle = alert.title
    .toLowerCase()
    .replace(/\b(spws|pws|inc|corp|corporation|ltd|limited|company|co|water|system)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 10)
    .join('-') || 'site';

  return `${alert.coordinates?.latitude.toFixed(6) ?? '0'}:${alert.coordinates?.longitude.toFixed(6) ?? '0'}:${normalizedTitle}`;
}

function getRenderableWaterImpactRadiusMetres(alert: AlertDetail) {
  if (typeof alert.impactRadiusMetres === 'number' && Number.isFinite(alert.impactRadiusMetres) && alert.impactRadiusMetres > 0) {
    return alert.impactRadiusMetres;
  }

  return alert.riskLevel === 'high' ? 900 : 90;
}

function BeachDetailCard({
  beach,
  bottomOffset,
  onClose,
}: {
  beach: BeachMonitoringPoint;
  bottomOffset: number;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const overallStatus = getBeachOverallStatus(beach);
  const ecoliStatus = getBeachEcoliStatus(beach);
  const algaeStatus = getBeachAlgaeStatus(beach);
  const microcystinStatus = getBeachMicrocystinStatus(beach);

  const sampleDate = beach.sampleDateEcoli ?? beach.sampleDateAlgae;
  const dateLabel = sampleDate
    ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(sampleDate))
    : null;
  const showMicrocystinRow =
    Boolean(beach.microcystinLevel) || beach.microcystinAdvisory.trim().toLowerCase() !== 'none';
  const metricRows: Array<{
    key: string;
    title: string;
    status: BeachMetricStatus;
    valueText: string | null;
  }> = [
    {
      key: 'ecoli',
      title: 'E. coli',
      status: ecoliStatus,
      valueText:
        beach.ecoliDensity !== null
          ? `${beach.ecoliDensity} per 100 mL | guideline: ${BEACH_ECOLI_GUIDELINE}`
          : null,
    },
    {
      key: 'algae',
      title: 'Blue-Green Algae',
      status: algaeStatus,
      valueText:
        beach.algaeCells !== null
          ? `${beach.algaeCells.toLocaleString()} cells/mL | guideline: ${BEACH_ALGAE_GUIDELINE.toLocaleString()}`
          : null,
    },
    ...(showMicrocystinRow
      ? [
          {
            key: 'microcystin',
            title: 'Microcystin (Toxin)',
            status: microcystinStatus,
            valueText: beach.microcystinLevel
              ? `${beach.microcystinLevel} mcg/L | guideline: ${BEACH_MICROCYSTIN_GUIDELINE}`
              : null,
          },
        ]
      : []),
  ];

  return (
    <Animated.View
      entering={MAP_MODAL_ENTER}
      exiting={MAP_MODAL_EXIT}
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: theme.spacing.md,
        right: theme.spacing.md,
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        boxShadow: theme.shadows.card,
      }}
    >
      {}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {beach.beachName}
          </Text>
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            {beach.region}{dateLabel ? ` | Sampled ${dateLabel}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor:
            overallStatus.tone === 'warning'
              ? theme.colors.highSoft
              : overallStatus.tone === 'advisory'
                ? theme.colors.mediumSoft
                : theme.colors.lowSoft,
          borderRadius: theme.radii.md,
          padding: theme.spacing.sm,
          gap: 4,
        }}
      >
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: getBeachToneColor(overallStatus.tone, theme.colors),
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text selectable style={{ ...theme.typography.caption, color: '#FFFFFF', fontWeight: '700' }}>
            {overallStatus.label}
          </Text>
        </View>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
          {overallStatus.summary}
        </Text>
      </View>

      {metricRows.map(({ key, title, status, valueText }) => (
        <View
          key={key}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.cardSecondary,
            borderRadius: theme.radii.md,
            padding: theme.spacing.sm,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              marginTop: 4,
              backgroundColor: getBeachToneColor(status.tone, theme.colors),
            }}
          />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text }}>
              {title}
            </Text>
            {valueText ? (
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                {valueText}
              </Text>
            ) : null}
            <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {status.explanation}
            </Text>
          </View>
          <Text
            selectable
            style={{
              ...theme.typography.caption,
              color: getBeachToneColor(status.tone, theme.colors),
              fontWeight: '600',
              maxWidth: 110,
              textAlign: 'right',
            }}
          >
            {status.label}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}

function AlertLocationDetailCard({
  alert,
  bottomOffset,
  onClose,
}: {
  alert: AlertDetail;
  bottomOffset: number;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const issuedLabel = formatAlertDate(alert.issuedAt);

  return (
    <Animated.View
      entering={MAP_MODAL_ENTER}
      exiting={MAP_MODAL_EXIT}
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: theme.spacing.md,
        right: theme.spacing.md,
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        boxShadow: theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {alert.title}
          </Text>
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            {alert.geographicScope}{issuedLabel ? ` | Issued ${issuedLabel}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: theme.colors.cardSecondary,
          borderRadius: theme.radii.md,
          padding: theme.spacing.sm,
          gap: theme.spacing.xs,
        }}
      >
        <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text }}>
          {alert.summary}
        </Text>
        <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
          {alert.description}
        </Text>
      </View>
    </Animated.View>
  );
}

function formatOutageDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return null;
  }
}

function MbReadyDetailCard({
  alert,
  bottomOffset,
  onClose,
}: {
  alert: MbReadyAlert;
  bottomOffset: number;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const isHigh = alert.severity === 'extreme' || alert.severity === 'severe';
  const severityColor = isHigh ? theme.colors.riskHigh : theme.colors.riskModerate;
  const bgColor = isHigh ? theme.colors.highSoft : theme.colors.mediumSoft;
  const effectiveLabel = alert.effective ? formatOutageDate(alert.effective) : null;
  const expiresLabel = alert.expires ? formatOutageDate(alert.expires) : null;

  return (
    <Animated.View
      entering={MAP_MODAL_ENTER}
      exiting={MAP_MODAL_EXIT}
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: theme.spacing.md,
        right: theme.spacing.md,
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        boxShadow: theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="alert-circle" size={15} color={severityColor} />
            <Text selectable style={{ ...theme.typography.caption, color: severityColor, fontWeight: '700', textTransform: 'uppercase' }}>
              {alert.severity} — {alert.event}
            </Text>
          </View>
          <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {alert.headline || alert.title}
          </Text>
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            {alert.areaDesc}{alert.senderName ? ` | ${alert.senderName}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={{ backgroundColor: bgColor, borderRadius: theme.radii.md, padding: theme.spacing.sm, gap: 4 }}>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
          {alert.description || alert.headline}
        </Text>
      </View>

      {(effectiveLabel || expiresLabel) ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {effectiveLabel ? (
            <View style={{ flex: 1 }}>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft, fontSize: 11, textTransform: 'uppercase' }}>Effective</Text>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.text }}>{effectiveLabel}</Text>
            </View>
          ) : null}
          {expiresLabel ? (
            <View style={{ flex: 1 }}>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textSoft, fontSize: 11, textTransform: 'uppercase' }}>Expires</Text>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.text }}>{expiresLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, fontSize: 11 }}>
        Alert Ready (National Public Alerting System)
      </Text>
    </Animated.View>
  );
}

function HydroDetailCard({
  outage,
  bottomOffset,
  onClose,
}: {
  outage: HydroOutage;
  bottomOffset: number;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const timeLabel = formatOutageDate(outage.timeOfOutage);
  const etrLabel = formatOutageDate(outage.estimatedRestoration);

  return (
    <Animated.View
      entering={MAP_MODAL_ENTER}
      exiting={MAP_MODAL_EXIT}
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: theme.spacing.md,
        right: theme.spacing.md,
        backgroundColor: theme.colors.card,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        boxShadow: theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="lightning-bolt" size={15} color={HYDRO_MARKER} />
            <Text selectable style={{ ...theme.typography.caption, color: HYDRO_MARKER, fontWeight: '700', textTransform: 'uppercase' }}>
              {outage.outageType} Outage
            </Text>
          </View>
          <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
            Power Outage
          </Text>
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            Manitoba Hydro
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: theme.colors.cardSecondary,
          borderRadius: theme.radii.md,
          padding: theme.spacing.sm,
          gap: theme.spacing.sm,
        }}
      >
        {[
          { label: 'Customers affected', value: outage.customersAffectedLabel || String(outage.customersAffected) },
          { label: 'Cause', value: outage.cause },
          { label: 'Crew status', value: outage.crewStatus },
          timeLabel ? { label: 'Outage began', value: timeLabel } : null,
          etrLabel ? { label: 'Est. restoration', value: etrLabel } : null,
        ]
          .filter(Boolean)
          .map((row) => row && (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, flex: 1 }}>
                {row.label}
              </Text>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.text, flex: 1.4, textAlign: 'right' }}>
                {row.value}
              </Text>
            </View>
          ))}
      </View>

      <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted, fontSize: 11 }}>
        Source: Manitoba Hydro: updated every 5 min
      </Text>
    </Animated.View>
  );
}

export function MapScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const snapshots = useAppStore((state) => state.snapshots);
  const selectedAreaSnapshot = useAppStore((state) => state.selectedAreaSnapshot);
  const rawAlertDetails = useAppStore((state) => state.rawAlertDetails);
  const selectedMapRegionId = useAppStore((state) => state.selectedMapRegionId);
  const activeArea = useAppStore((state) => state.activeArea);
  const mapLocationAlerts = useAppStore((state) => state.mapLocationAlerts);
  const beachMonitoringPoints = useAppStore((state) => state.beachMonitoringPoints);
  const mbReadyAlerts = useAppStore((state) => state.mbReadyAlerts);
  const hydroOutages = useAppStore((state) => state.hydroOutages);
  const setSelectedMapRegion = useAppStore((state) => state.setSelectedMapRegion);
  const isRegionSwitching = useAppStore((state) => state.isRegionSwitching);
  const isRefreshing = useAppStore((state) => state.isRefreshing);
  const locationSource = useAppStore((state) => state.locationSource);
  const userCoordinates = useAppStore((state) => state.userCoordinates);
  const mapRef = useRef<MapView>(null);
  const selectedSnapshot = snapshots[selectedMapRegionId];
  const activeAreaSnapshot = activeArea
    ? selectedAreaSnapshot?.region.id === activeArea.parentRegionId
      ? selectedAreaSnapshot
      : snapshots[activeArea.parentRegionId]
    : null;
  const [selectedBeach, setSelectedBeach] = useState<BeachMonitoringPoint | null>(null);
  const [selectedMapAlert, setSelectedMapAlert] = useState<AlertDetail | null>(null);
  const [selectedMbReadyAlert, setSelectedMbReadyAlert] = useState<MbReadyAlert | null>(null);
  const [selectedHydroOutage, setSelectedHydroOutage] = useState<HydroOutage | null>(null);

  const [showBeach, setShowBeach] = useState(true);
  const [showWaterPublic, setShowWaterPublic] = useState(true);
  const [showWaterSite, setShowWaterSite] = useState(true);
  const [showWildfire, setShowWildfire] = useState(true);
  const [showMbReady, setShowMbReady] = useState(true);
  const [showHydro, setShowHydro] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [isZonePreviewVisible, setIsZonePreviewVisible] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  const selectedZone = selectedZoneId
    ? MANITOBA_SUB_REGIONS.find((zone) => zone.id === selectedZoneId) ?? null
    : null;
  const zoneModalHeight = Math.min(windowHeight * 0.56, 480);
  // The tab scene already ends above the tab bar, so offsets are measured from the scene bottom.
  const zoneModalBottom = theme.spacing.sm;
  const isZoneModalVisible = isZonePreviewVisible && Boolean(selectedZone);
  const floatingOverlayBottom = isZoneModalVisible
    ? zoneModalBottom + zoneModalHeight + theme.spacing.md
    : theme.spacing.md;
  const floatingCardBottom = theme.spacing.md;
  const floatingLegendTop = insets.top + theme.spacing.sm;

  const waterMapAlerts = useMemo(
    () => mapLocationAlerts.filter((alert) => alert.category === 'water' && alert.coordinates),
    [mapLocationAlerts],
  );
  const displayWaterMapAlerts = useMemo(() => {
    const groups = new Map<string, AlertDetail[]>();

    waterMapAlerts.forEach((alert) => {
      const key = getWaterSiteGroupKey(alert);
      const current = groups.get(key);
      if (current) {
        current.push(alert);
        return;
      }
      groups.set(key, [alert]);
    });

    return [...groups.values()].map((group) => {
      const sorted = [...group].sort(sortAlertDetails);
      const representative = sorted.find((alert) => alert.impactPolygon?.length) ?? sorted[0];

      if (group.length === 1) {
        return representative;
      }

      const siteTitle = [...new Set(group.map((alert) => alert.title))][0] ?? representative.title;

      return {
        ...representative,
        title: siteTitle,
        summary: `${group.length} water advisories share this site`,
        description: `${group.length} active water advisories resolve to the same mapped site for ${siteTitle}. Open the source link to review the individual records.`,
      } satisfies AlertDetail;
    });
  }, [waterMapAlerts]);

  const wildfireMapAlerts = useMemo(
    () => rawAlertDetails.filter((alert) => alert.category === 'wildfire' && alert.coordinates),
    [rawAlertDetails],
  );

  const mapAlertDots = useMemo(
    () => [...displayWaterMapAlerts, ...wildfireMapAlerts].sort(sortAlertDetails),
    [displayWaterMapAlerts, wildfireMapAlerts],
  );

  const zoneSnapshots = useMemo(() => {
    return Object.fromEntries(
      MANITOBA_SUB_REGIONS.map((zone) => {
        const parentSnapshot = snapshots[zone.parentRegionId];
        if (!parentSnapshot) {
          return [zone.id, null];
        }

        const waterAlertsInZone = displayWaterMapAlerts.filter((alert) =>
          waterAreaIntersectsPolygon(
            alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> },
            zone.polygon,
          ),
        );
        const publicWaterInZone = waterAlertsInZone.filter((alert) => alert.riskLevel === 'high');
        const siteWaterInZone = waterAlertsInZone.filter((alert) => alert.riskLevel !== 'high');
        const wildfiresInZone = wildfireMapAlerts.filter((alert) =>
          pointInPolygon(alert.coordinates!.latitude, alert.coordinates!.longitude, zone.polygon),
        );

        const zoneAlerts = {
          ...parentSnapshot.alerts,
          water: {
            ...parentSnapshot.alerts.water,
            value: waterAlertsInZone.length,
            riskLevel: 'low',
            summary:
              waterAlertsInZone.length
                ? [
                    publicWaterInZone.length
                      ? `${publicWaterInZone.length} public drinking-water advisory${publicWaterInZone.length === 1 ? '' : 'ies'} affecting this zone`
                      : null,
                    siteWaterInZone.length
                      ? `${siteWaterInZone.length} site-specific water advisory${siteWaterInZone.length === 1 ? '' : 'ies'} affecting this zone`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' | ')
                : 'No drinking-water advisories affecting this zone',
            details: waterAlertsInZone.slice(0, 4).map((alert) => alert.title),
          },
          wildfire: {
            ...parentSnapshot.alerts.wildfire,
            value: wildfiresInZone.length,
            riskLevel: wildfiresInZone.length ? 'high' : 'low',
            summary: wildfiresInZone.length
              ? `${wildfiresInZone.length} active wildfire${wildfiresInZone.length === 1 ? '' : 's'} in this zone`
              : 'No active wildfires inside this zone',
            details: wildfiresInZone.slice(0, 3).map((alert) => alert.title),
          },
        } satisfies Record<string, CategoryAlert>;

        return [
          zone.id,
          {
            region: parentSnapshot.region,
            alerts: zoneAlerts,
            safetyIndex: calculateSafetyIndex(zoneAlerts),
          },
        ];
      }),
    ) as Record<
      string,
      | {
          region: RegionSnapshot['region'];
          alerts: Record<string, CategoryAlert>;
          safetyIndex: ReturnType<typeof calculateSafetyIndex>;
        }
      | null
    >;
  }, [displayWaterMapAlerts, snapshots, wildfireMapAlerts]);

  const selectedZoneSnapshot = selectedZone ? zoneSnapshots[selectedZone.id] : null;
  const effectiveSelectedSnapshot = isZoneModalVisible ? (selectedZoneSnapshot ?? selectedSnapshot) : selectedSnapshot;
  const selectedZoneExactAlerts = useMemo(
    () =>
      isZoneModalVisible && selectedZone
        ? mapAlertDots
            .filter((alert) =>
              alert.category === 'water'
                ? waterAreaIntersectsPolygon(
                    alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> },
                    selectedZone.polygon,
                  )
                : pointInPolygon(alert.coordinates!.latitude, alert.coordinates!.longitude, selectedZone.polygon),
            )
            .sort(sortAlertDetails)
        : [],
    [isZoneModalVisible, mapAlertDots, selectedZone],
  );
  const selectedZoneBroaderAlerts = useMemo(
    () =>
      isZoneModalVisible && selectedZone
        ? rawAlertDetails
            .filter(
              (alert) =>
                !alert.coordinates &&
                alert.category === 'healthAdvisories' &&
                alert.regionIds.includes(selectedZone.parentRegionId),
            )
            .sort(sortAlertDetails)
        : [],
    [isZoneModalVisible, rawAlertDetails, selectedZone],
  );
  const showActiveAreaOverlay = Boolean(activeArea && activeAreaSnapshot && locationSource === 'gps');
  const focusTargetRegion = useMemo(() => {
    if (userCoordinates) {
      if (activeArea?.polygon.length) {
        return boundsToMapRegion(getPolygonBounds(activeArea.polygon), 0.36, 0.16, 0.16);
      }

      return {
        latitude: userCoordinates.latitude,
        longitude: userCoordinates.longitude,
        latitudeDelta: 0.28,
        longitudeDelta: 0.28,
      };
    }

    if (isZoneModalVisible && selectedZone) {
      return boundsToMapRegion(selectedZone.bounds, 0.2, 0.18, 0.18);
    }

    if (activeArea?.polygon.length) {
      return boundsToMapRegion(getPolygonBounds(activeArea.polygon), 0.24, 0.2, 0.2);
    }

    return boundsToMapRegion(effectiveSelectedSnapshot.region.bounds, 0.18, 0.34, 0.34);
  }, [activeArea, effectiveSelectedSnapshot.region.bounds, isZoneModalVisible, selectedZone, userCoordinates]);

  const closeZonePreview = useCallback(() => {
    setIsZonePreviewVisible(false);
  }, []);

  const waterAlertMarkers = useMemo(
    () =>
      displayWaterMapAlerts.map((alert) => {
        const isPublic = alert.riskLevel === 'high';
        const visible = isPublic ? showWaterPublic : showWaterSite;
        const markerStyle = getMapAlertMarkerStyle(alert);
        const markerCoordinate =
          alert.impactPolygon?.length
            ? getPolygonCentroid(alert.impactPolygon)
            : alert.coordinates!;
        return (
          <Marker
            key={alert.id}
            coordinate={markerCoordinate}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            opacity={visible ? 1 : 0}
            onPress={() => {
              if (!visible) return;
              setSelectedBeach(null);
              setSelectedMapAlert(alert);
              closeZonePreview();
            }}
          >
            <View
              style={{
                width: markerStyle.size,
                height: markerStyle.size,
                borderRadius: markerStyle.size / 2,
                backgroundColor: markerStyle.fill,
                borderWidth: 2,
                borderColor: WATER_SITE_STROKE,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.22,
                shadowRadius: 2,
                elevation: 3,
              }}
            >
              <MaterialCommunityIcons name={markerStyle.icon} size={markerStyle.iconSize} color="#FFFFFF" />
            </View>
          </Marker>
        );
      }),
    [closeZonePreview, displayWaterMapAlerts, showWaterPublic, showWaterSite],
  );

  const wildfireAlertMarkers = useMemo(
    () =>
      wildfireMapAlerts.map((alert) => {
        const markerStyle = getMapAlertMarkerStyle(alert);
        return (
          <Marker
            key={alert.id}
            coordinate={alert.coordinates!}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            opacity={showWildfire ? 1 : 0}
            onPress={() => {
              if (!showWildfire) return;
              setSelectedBeach(null);
              setSelectedMapAlert(alert);
              closeZonePreview();
            }}
          >
            <View
              style={{
                width: markerStyle.size,
                height: markerStyle.size,
                borderRadius: markerStyle.size / 2,
                backgroundColor: markerStyle.fill,
                borderWidth: 2,
                borderColor: WATER_SITE_STROKE,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.22,
                shadowRadius: 2,
                elevation: 3,
              }}
            >
              <MaterialCommunityIcons name={markerStyle.icon} size={markerStyle.iconSize} color="#FFFFFF" />
            </View>
          </Marker>
        );
      }),
    [closeZonePreview, showWildfire, wildfireMapAlerts],
  );

  const openZonePreview = useCallback((zoneId: string, parentRegionId: RegionId) => {
    setSelectedBeach(null);
    setSelectedMapAlert(null);
    setSelectedMbReadyAlert(null);
    setSelectedHydroOutage(null);
    setIsLegendExpanded(false);
    if (selectedMapRegionId !== parentRegionId) {
      setSelectedMapRegion(parentRegionId);
    }
    setSelectedZoneId(zoneId);
    setIsZonePreviewVisible(true);
  }, [selectedMapRegionId, setSelectedMapRegion]);

  const handleMapPress = useCallback(() => {
    if (selectedBeach) setSelectedBeach(null);
    if (selectedMapAlert) setSelectedMapAlert(null);
    if (selectedMbReadyAlert) setSelectedMbReadyAlert(null);
    if (selectedHydroOutage) setSelectedHydroOutage(null);
    if (isLegendExpanded) setIsLegendExpanded(false);
    if (isZoneModalVisible) closeZonePreview();
  }, [closeZonePreview, isLegendExpanded, isZoneModalVisible, selectedBeach, selectedHydroOutage, selectedMapAlert, selectedMbReadyAlert]);
  const baseRegionPolygons = useMemo(
    () =>
      MANITOBA_REGIONS.map((region) => {
        const snapshot = snapshots[region.id];
        if (!snapshot) return null;
        const accent = getRiskColor(getWaterNeutralOverallRisk(snapshot), theme.colors);

        return (
          <Polygon
            key={`${region.id}:base`}
            coordinates={REGION_POLYGON_COORDINATES[region.id]}
            tappable
            onPress={(event) => {
              const tapPoint = event.nativeEvent.coordinate;
              if (!tapPoint) {
                return;
              }

              const nearestZone = findZoneForTap(region.id, tapPoint);

              if (!nearestZone) {
                return;
              }

              openZonePreview(nearestZone.id, region.id);
            }}
            fillColor={hexToRgba(accent, 0.08)}
            strokeColor="transparent"
            strokeWidth={0}
          />
        );
      }),
    [openZonePreview, snapshots, theme.colors],
  );
  const zonePolygons = useMemo(
    () =>
      MANITOBA_SUB_REGIONS.map((subRegion) => {
        const zoneSnapshot = zoneSnapshots[subRegion.id];
        if (!zoneSnapshot) return null;

        const zoneAccent = getRiskColor(zoneSnapshot.safetyIndex.overallRisk, theme.colors);

        return (
          <Polygon
            key={subRegion.id}
            coordinates={SUB_REGION_POLYGON_COORDINATES[subRegion.id]}
            fillColor={hexToRgba(zoneAccent, 0.28)}
            strokeColor={hexToRgba(zoneAccent, 0.6)}
            strokeWidth={1.5}
          />
        );
      }),
    [theme.colors, zoneSnapshots],
  );
  const waterImpactAreas = useMemo(
    () =>
      displayWaterMapAlerts
        .filter((alert) => alert.coordinates)
        .map((alert) => {
          const isPublic = alert.riskLevel === 'high';
          const visible = isPublic ? showWaterPublic : showWaterSite;
          const fillColor = visible
            ? isPublic ? PUBLIC_WATER_AREA_FILL : LOCAL_WATER_AREA_FILL
            : 'transparent';
          const strokeColor = visible
            ? isPublic ? PUBLIC_WATER_AREA_STROKE : LOCAL_WATER_AREA_STROKE
            : 'transparent';
          const coords = alert.impactPolygon?.length
            ? toLatLngCoordinates(alert.impactPolygon)
            : toCirclePolygon(alert.coordinates!, getRenderableWaterImpactRadiusMetres(alert));
          return (
            <Polygon
              key={`water-impact:${alert.id}`}
              coordinates={coords}
              tappable={visible}
              zIndex={3}
              onPress={() => {
                if (!visible) return;
                setSelectedBeach(null);
                setSelectedMapAlert(alert);
                closeZonePreview();
              }}
              fillColor={fillColor}
              strokeColor={strokeColor}
              strokeWidth={2}
            />
          );
        }),
    [closeZonePreview, displayWaterMapAlerts, showWaterPublic, showWaterSite],
  );
  const ecoliCircles = useMemo(
    () =>
      beachMonitoringPoints
        .filter((beach) => getBeachEcoliStatus(beach).tone === 'warning' && beach.ecoliDensity !== null)
        .map((beach) => (
          <Circle
            key={`ecoli:${beach.id}`}
            center={{ latitude: beach.latitude, longitude: beach.longitude }}
            radius={ecoliRadiusMetres(beach.ecoliDensity!)}
            fillColor={showBeach ? BEACH_WARNING_AREA_FILL : 'transparent'}
            strokeColor={showBeach ? BEACH_WARNING_AREA_STROKE : 'transparent'}
            strokeWidth={2}
          />
        )),
    [beachMonitoringPoints, showBeach],
  );
  const algaeCircles = useMemo(
    () =>
      beachMonitoringPoints
        .filter((beach) => getBeachAlgaeStatus(beach).tone === 'warning' && beach.algaeCells !== null)
        .map((beach) => (
          <Circle
            key={`algae:${beach.id}`}
            center={{ latitude: beach.latitude, longitude: beach.longitude }}
            radius={algaeRadiusMetres(beach.algaeCells!)}
            fillColor={showBeach ? BEACH_WARNING_AREA_FILL : 'transparent'}
            strokeColor={showBeach ? BEACH_WARNING_AREA_STROKE : 'transparent'}
            strokeWidth={2}
          />
        )),
    [beachMonitoringPoints, showBeach],
  );
  const beachMarkers = useMemo(
    () => {
      return beachMonitoringPoints.map((beach) => {
        const status = getBeachOverallStatus(beach);
        const bgColor = getBeachMarkerColor(status.tone);
        const iconName = getBeachMarkerIcon(status.tone);
        return (
          <Marker
            key={`beach:${beach.id}`}
            coordinate={{ latitude: beach.latitude, longitude: beach.longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            opacity={showBeach ? 1 : 0}
            onPress={() => {
              if (!showBeach) return;
              setSelectedMapAlert(null);
              setSelectedBeach(beach);
              closeZonePreview();
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: 2.5,
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: bgColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.25,
                shadowRadius: 3,
                elevation: 4,
              }}
            >
              <MaterialCommunityIcons name={iconName} size={12} color="#FFFFFF" />
            </View>
          </Marker>
        );
      });
    },
    [beachMonitoringPoints, closeZonePreview, showBeach],
  );

  const mbReadyPolygons = useMemo(
    () =>
      mbReadyAlerts
        .filter((alert) => alert.polygon && alert.polygon.length >= 3)
        .map((alert) => {
          const isHigh = alert.severity === 'extreme' || alert.severity === 'severe';
          return (
            <Polygon
              key={`mbready-poly:${alert.id}`}
              coordinates={toLatLngCoordinates(alert.polygon!)}
              tappable={showMbReady}
              zIndex={4}
              fillColor={showMbReady ? (isHigh ? MB_READY_HIGH_FILL : MB_READY_FILL) : 'transparent'}
              strokeColor={showMbReady ? (isHigh ? MB_READY_HIGH_STROKE : MB_READY_STROKE) : 'transparent'}
              strokeWidth={2}
              onPress={() => {
                if (!showMbReady) return;
                setSelectedBeach(null);
                setSelectedMapAlert(null);
                setSelectedHydroOutage(null);
                setSelectedMbReadyAlert(alert);
                closeZonePreview();
              }}
            />
          );
        }),
    [closeZonePreview, mbReadyAlerts, showMbReady],
  );

  const mbReadyMarkers = useMemo(
    () =>
      mbReadyAlerts
        .map((alert) => {
          const isHigh = alert.severity === 'extreme' || alert.severity === 'severe';
          const markerColor = isHigh ? MB_READY_HIGH_MARKER : MB_READY_MARKER;
          const center = alert.polygon?.length ? getPolygonCentroid(alert.polygon) : null;
          if (!center) return null;
          return (
            <Marker
              key={`mbready-marker:${alert.id}`}
              coordinate={center}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              opacity={showMbReady ? 1 : 0}
              onPress={() => {
                if (!showMbReady) return;
                setSelectedBeach(null);
                setSelectedMapAlert(null);
                setSelectedHydroOutage(null);
                setSelectedMbReadyAlert(alert);
                closeZonePreview();
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: markerColor,
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3,
                  elevation: 5,
                }}
              >
                <MaterialCommunityIcons name="alert-circle" size={13} color="#FFFFFF" />
              </View>
            </Marker>
          );
        })
        .filter(Boolean),
    [closeZonePreview, mbReadyAlerts, showMbReady],
  );

  const hydroPolygons = useMemo(
    () =>
      hydroOutages.map((outage) => (
        <Polygon
          key={`hydro-poly:${outage.id}`}
          coordinates={toLatLngCoordinates(outage.polygon)}
          tappable={showHydro}
          zIndex={4}
          fillColor={showHydro ? HYDRO_FILL : 'transparent'}
          strokeColor={showHydro ? HYDRO_STROKE : 'transparent'}
          strokeWidth={1.5}
          onPress={() => {
            if (!showHydro) return;
            setSelectedBeach(null);
            setSelectedMapAlert(null);
            setSelectedMbReadyAlert(null);
            setSelectedHydroOutage(outage);
            closeZonePreview();
          }}
        />
      )),
    [closeZonePreview, hydroOutages, showHydro],
  );

  const hydroMarkers = useMemo(
    () =>
      hydroOutages.map((outage) => (
        <Marker
          key={`hydro-marker:${outage.id}`}
          coordinate={outage.centroid}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.5 }}
          opacity={showHydro ? 1 : 0}
          onPress={() => {
            if (!showHydro) return;
            setSelectedBeach(null);
            setSelectedMapAlert(null);
            setSelectedMbReadyAlert(null);
            setSelectedHydroOutage(outage);
            closeZonePreview();
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: HYDRO_MARKER,
              borderWidth: 2,
              borderColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.22,
              shadowRadius: 2,
              elevation: 4,
            }}
          >
            <MaterialCommunityIcons name="lightning-bolt" size={12} color="#FFFFFF" />
          </View>
        </Marker>
      )),
    [closeZonePreview, hydroOutages, showHydro],
  );

  const selectedZonePolygon = null;
  const selectedZoneLabelMarker = null;
  const activeAreaMarker = null;
  const zonePreviewCard = (
    <>
      <View
        style={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
            Selected zone
          </Text>
          <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {selectedZone?.name ?? effectiveSelectedSnapshot.region.label}
          </Text>
          <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
            {formatRiskLevel(effectiveSelectedSnapshot.safetyIndex.overallRisk)} overall risk
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: theme.spacing.sm }}>
          <Pressable onPress={closeZonePreview} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>
          <MiniScoreRing
            riskLevel={effectiveSelectedSnapshot.safetyIndex.overallRisk}
            score={effectiveSelectedSnapshot.safetyIndex.overallScore}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg + insets.bottom,
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.cardSecondary,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          {activeArea && activeArea.parentRegionId === effectiveSelectedSnapshot.region.id ? (
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
                gap: 4,
              }}
            >
              <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
                Active local area
              </Text>
              <Text selectable style={{ ...theme.typography.title, color: theme.colors.text }}>
                {activeArea.label}
              </Text>
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                {activeArea.description}
              </Text>
            </View>
          ) : null}
          {effectiveSelectedSnapshot.safetyIndex.breakdown
            .filter((item) => item.category !== 'water')
            .map((item) => {
            const accent = getRiskColor(item.riskLevel, theme.colors);
            return (
              <View
                key={item.category}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <MaterialCommunityIcons name={CATEGORY_META[item.category].icon as never} size={18} color={accent} />
                  <Text selectable style={{ ...theme.typography.body, color: theme.colors.text }}>
                    {CATEGORY_META[item.category].shortLabel}
                  </Text>
                </View>
                <Text selectable style={{ ...theme.typography.caption, color: accent }}>
                  {formatRiskLevel(item.riskLevel)}
                </Text>
              </View>
            );
          })}
        </View>

        {selectedZone ? (
          <View
            style={{
              backgroundColor: theme.colors.cardSecondary,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
              gap: theme.spacing.sm,
            }}
          >
            <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
              Inside this zone
            </Text>
            {selectedZoneExactAlerts.length ? (
              selectedZoneExactAlerts.slice(0, 6).map((alert) => {
                const accent = getRiskColor(alert.riskLevel, theme.colors);
                return (
                  <View
                    key={`zone-alert:${alert.id}`}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: theme.radii.md,
                      padding: theme.spacing.sm,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
                        <MaterialCommunityIcons
                          name={CATEGORY_META[alert.category].icon as never}
                          size={16}
                          color={accent}
                        />
                        <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text, flex: 1 }}>
                          {alert.title}
                        </Text>
                      </View>
                      <Text selectable style={{ ...theme.typography.caption, color: accent }}>
                        {formatRiskLevel(alert.riskLevel)}
                      </Text>
                    </View>
                    <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                      {alert.summary}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                No coordinate-backed advisories or fires are inside this zone right now.
              </Text>
            )}

            {selectedZoneBroaderAlerts.length ? (
              <>
                <View style={{ height: 1, backgroundColor: theme.colors.divider }} />
                <Text selectable style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>
                  Broader bulletins
                </Text>
                {selectedZoneBroaderAlerts.slice(0, 3).map((alert) => (
                  <View
                    key={`zone-broad:${alert.id}`}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: theme.radii.md,
                      padding: theme.spacing.sm,
                      gap: 4,
                    }}
                  >
                    <Text selectable style={{ ...theme.typography.bodyStrong, color: theme.colors.text }}>
                      {alert.title}
                    </Text>
                    <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                      {alert.summary}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
  const zonePreviewOverlay = isZoneModalVisible ? (
    <Animated.View
      entering={MAP_MODAL_BACKDROP_ENTER}
      exiting={MAP_MODAL_BACKDROP_EXIT}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        justifyContent: 'flex-end',
        paddingHorizontal: theme.spacing.md,
        paddingBottom: zoneModalBottom,
        backgroundColor: theme.colors.scrim,
      }}
    >
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
        onPress={closeZonePreview}
      />

      <Animated.View
        entering={MAP_MODAL_ENTER}
        exiting={MAP_MODAL_EXIT}
        style={{
          maxHeight: zoneModalHeight,
          backgroundColor: theme.colors.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: theme.colors.divider,
          boxShadow: theme.shadows.card,
          overflow: 'hidden',
        }}
      >
        {zonePreviewCard}
      </Animated.View>
    </Animated.View>
  ) : null;

  if (Platform.OS === 'web') {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Text selectable style={{ ...theme.typography.heading, color: theme.colors.text }}>
          Map is available on iOS and Android.
        </Text>
        <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
          The regional choropleth map uses native map rendering and polygon overlays.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={MANITOBA_MAP_REGION}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={Boolean(userCoordinates)}
        toolbarEnabled={false}
        customMapStyle={theme.isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        userInterfaceStyle={theme.isDark ? 'dark' : 'light'}
        onPress={handleMapPress}
      >
        {}
        {baseRegionPolygons}
        {zonePolygons}
        {selectedZonePolygon}

        {}
        {waterImpactAreas}
        {waterAlertMarkers}
        {wildfireAlertMarkers}

        {}

        {}
        {ecoliCircles}

        {}
        {algaeCircles}

        {}
        {beachMarkers}

        {}
        {mbReadyPolygons}
        {mbReadyMarkers}

        {}
        {hydroPolygons}
        {hydroMarkers}

        {selectedZoneLabelMarker}
        {false ? MANITOBA_SUB_REGIONS.map((subRegion) => {
          const zoneSnapshot = zoneSnapshots[subRegion.id];
          if (!zoneSnapshot) return null;

          const isSelectedSubRegion = selectedZoneId === subRegion.id;
          const accent = getRiskColor(zoneSnapshot.safetyIndex.overallRisk, theme.colors);

          return (
            <Marker
              key={`${subRegion.id}:sublabel`}
              coordinate={subRegion.center}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => openZonePreview(subRegion.id, subRegion.parentRegionId as RegionId)}
            >
              <View
                style={{
                  backgroundColor: isSelectedSubRegion ? accent : `${accent}CC`,
                  borderRadius: 6,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  borderWidth: isSelectedSubRegion ? 1.5 : 0,
                  borderColor: accent,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: '#FFFFFF',
                  }}
                >
                  {subRegion.shortName}
                </Text>
              </View>
            </Marker>
          );
        }) : null}

        {}
        {activeAreaMarker}
        {false ? showActiveAreaOverlay ? (
          <Marker coordinate={activeArea!.center} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
            <MapMarker
              label={activeArea!.shortLabel}
              riskLevel={activeAreaSnapshot!.safetyIndex.overallRisk}
              selected
            />
          </Marker>
        ) : null : null}
      </MapView>

      {}
      {!isZoneModalVisible ? (
        <View
          style={{
            position: 'absolute',
            top: floatingLegendTop,
            left: theme.spacing.md,
            gap: theme.spacing.sm,
            maxWidth: 250,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isLegendExpanded ? 'Collapse map legend' : 'Expand map legend'}
            onPress={() => setIsLegendExpanded((current) => !current)}
            style={{
              backgroundColor: theme.colors.overlay,
              borderRadius: theme.radii.pill,
              paddingLeft: 12,
              paddingRight: 10,
              paddingVertical: 9,
              borderWidth: 1,
              borderColor: theme.colors.divider,
              boxShadow: theme.shadows.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              alignSelf: 'flex-start',
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.cardSecondary,
              }}
            >
              <MaterialCommunityIcons name="layers-outline" size={16} color={theme.colors.primary} />
            </View>
            <View style={{ gap: 1 }}>
              <Text selectable style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>
                Map Legend
              </Text>
              <Text selectable style={{ fontSize: 11, color: theme.colors.textMuted }}>
                {isLegendExpanded ? 'Tap to collapse' : 'Tap to view symbols'}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isLegendExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textMuted}
            />
          </Pressable>

          {isLegendExpanded ? (
            <Animated.View
              entering={MAP_MODAL_ENTER}
              exiting={MAP_MODAL_EXIT}
              style={{
                backgroundColor: theme.colors.overlay,
                borderRadius: 20,
                paddingVertical: theme.spacing.sm,
                borderWidth: 1,
                borderColor: theme.colors.divider,
                boxShadow: theme.shadows.card,
                overflow: 'hidden',
              }}
            >
              {}
              <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: 8, gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textSoft, textTransform: 'uppercase' }}>
                  Zone risk
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {(['low', 'moderate', 'high'] as RiskLevel[]).map((level) => (
                    <View key={level} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getRiskColor(level, theme.colors) }} />
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{formatRiskLevel(level)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.divider }} />

              {}
              {([
                beachMonitoringPoints.length > 0 ? {
                  key: 'beach',
                  label: 'Beach water quality',
                  dot: BEACH_ADVISORY_FILL,
                  icon: 'waves' as const,
                  on: showBeach,
                  toggle: () => setShowBeach((v) => !v),
                } : null,
                {
                  key: 'water-public',
                  label: 'Public water advisories',
                  dot: PUBLIC_WATER_FILL,
                  icon: 'water-alert' as const,
                  on: showWaterPublic,
                  toggle: () => setShowWaterPublic((v) => !v),
                },
                {
                  key: 'water-site',
                  label: 'Site-specific advisories',
                  dot: WATER_SITE_FILL,
                  icon: 'water-outline' as const,
                  on: showWaterSite,
                  toggle: () => setShowWaterSite((v) => !v),
                },
                {
                  key: 'wildfire',
                  label: 'Wildfires',
                  dot: WILDFIRE_FILL,
                  icon: 'fire' as const,
                  on: showWildfire,
                  toggle: () => setShowWildfire((v) => !v),
                },
                mbReadyAlerts.length > 0 ? {
                  key: 'mbready',
                  label: 'Emergency alerts (Alert Ready)',
                  dot: MB_READY_HIGH_MARKER,
                  icon: 'alert-circle' as const,
                  on: showMbReady,
                  toggle: () => setShowMbReady((v) => !v),
                } : null,
                hydroOutages.length > 0 ? {
                  key: 'hydro',
                  label: 'Power outages',
                  dot: HYDRO_MARKER,
                  icon: 'lightning-bolt' as const,
                  on: showHydro,
                  toggle: () => setShowHydro((v) => !v),
                } : null,
              ] as const).filter(Boolean).map((row) => row && (
                <Pressable
                  key={row.key}
                  onPress={row.toggle}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 10,
                    opacity: row.on ? 1 : 0.45,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${row.dot}22`,
                    }}
                  >
                    <MaterialCommunityIcons name={row.icon} size={14} color={row.dot} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>{row.label}</Text>
                  <View
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: row.on ? theme.colors.primary : theme.colors.cardSecondary,
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: '#FFFFFF',
                        alignSelf: row.on ? 'flex-end' : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {(isRefreshing || isRegionSwitching) ? (
        <View
          style={{
            position: 'absolute',
            right: theme.spacing.md,
            bottom: floatingOverlayBottom + 68,
            backgroundColor: theme.colors.overlay,
            borderRadius: theme.radii.lg,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            boxShadow: theme.shadows.card,
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text selectable style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
            Refreshing map data
          </Text>
        </View>
      ) : null}

      {}
      {!isZoneModalVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={userCoordinates ? 'Zoom to your current location' : 'Zoom to your selected area'}
          onPress={() => mapRef.current?.animateToRegion(focusTargetRegion, 350)}
          style={{
            position: 'absolute',
            right: theme.spacing.md,
            bottom: floatingOverlayBottom,
            width: 54,
            height: 54,
            borderRadius: 27,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.divider,
            boxShadow: theme.shadows.card,
          }}
        >
          <MaterialCommunityIcons
            name={userCoordinates ? 'crosshairs-gps' : 'map-marker-radius'}
            size={24}
            color={theme.colors.primary}
          />
        </Pressable>
      ) : null}

      {selectedBeach ? (
        <BeachDetailCard
          key={`beach-detail:${selectedBeach.id}`}
          beach={selectedBeach}
          bottomOffset={floatingCardBottom}
          onClose={() => setSelectedBeach(null)}
        />
      ) : null}
      {selectedMapAlert ? (
        <AlertLocationDetailCard
          key={`map-alert:${selectedMapAlert.id}`}
          alert={selectedMapAlert}
          bottomOffset={floatingCardBottom}
          onClose={() => setSelectedMapAlert(null)}
        />
      ) : null}
      {selectedMbReadyAlert ? (
        <MbReadyDetailCard
          key={`mbready-detail:${selectedMbReadyAlert.id}`}
          alert={selectedMbReadyAlert}
          bottomOffset={floatingCardBottom}
          onClose={() => setSelectedMbReadyAlert(null)}
        />
      ) : null}
      {selectedHydroOutage ? (
        <HydroDetailCard
          key={`hydro-detail:${selectedHydroOutage.id}`}
          outage={selectedHydroOutage}
          bottomOffset={floatingCardBottom}
          onClose={() => setSelectedHydroOutage(null)}
        />
      ) : null}

      {zonePreviewOverlay}
    </View>
  );
}
