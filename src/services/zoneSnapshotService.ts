import { getPolygonBounds, pointInPolygon } from '../data/manitobaGeometry';
import { SubRegion } from '../data/manitobaSubRegions';
import {
  AlertDetail,
  CategoryAlert,
  LocalAreaProfile,
  RegionCoordinate,
  RegionSnapshot,
  RiskLevel,
} from '../types/alerts';
import { calculateSafetyIndex } from './safetyIndex';
import { getVectorRiskLevel } from './vectorBorneService';
import { fetchWeatherAndAirQualityForPoint } from './weatherAirQualityService';
import { waterAreaContainsPoint, waterAreaIntersectsPolygon } from './waterAdvisoryService';

type LocalizedSnapshotResult = {
  snapshot: RegionSnapshot;
  exactAlerts: AlertDetail[];
  broaderAlerts: AlertDetail[];
};

type SnapshotOverrides = {
  weatherAlert?: CategoryAlert;
  airAlert?: CategoryAlert;
};

type WaterAreaMode = 'point' | 'polygon';

type SnapshotArea = {
  label: string;
  shortLabel: string;
  description: string;
  parentRegionId: SubRegion['parentRegionId'];
  center: RegionCoordinate;
  polygon: readonly RegionCoordinate[];
  scopeLabel: string;
};

function toSortableTime(value?: string | number | null) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareAlerts(left: AlertDetail, right: AlertDetail) {
  const severityOrder: Record<RiskLevel, number> = {
    high: 0,
    moderate: 1,
    low: 2,
  };

  const severityDelta = severityOrder[left.riskLevel] - severityOrder[right.riskLevel];
  return severityDelta !== 0 ? severityDelta : toSortableTime(right.updatedAt) - toSortableTime(left.updatedAt);
}

function alertIntersectsArea(alert: AlertDetail, area: SnapshotArea, waterAreaMode: WaterAreaMode) {
  if (!alert.coordinates) {
    return false;
  }

  if (alert.category === 'water') {
    return waterAreaMode === 'point'
      ? waterAreaContainsPoint(
          alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> },
          area.center,
        )
      : waterAreaIntersectsPolygon(
          alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> },
          area.polygon,
        );
  }

  return pointInPolygon(alert.coordinates.latitude, alert.coordinates.longitude, area.polygon);
}

function filterAlertsInsideArea(area: SnapshotArea, alerts: AlertDetail[], waterAreaMode: WaterAreaMode) {
  return alerts.filter((alert) => alertIntersectsArea(alert, area, waterAreaMode));
}

function buildAreaWaterAlert(
  parentAlert: CategoryAlert,
  waterAlerts: AlertDetail[],
  scopeLabel: string,
  includeInScore: boolean,
): CategoryAlert {
  const publicAlerts = waterAlerts.filter((alert) => alert.riskLevel === 'high');
  const localAlerts = waterAlerts.filter((alert) => alert.riskLevel !== 'high');
  const summaryParts: string[] = [];

  if (publicAlerts.length) {
    summaryParts.push(
      `${publicAlerts.length} public drinking-water advisory${publicAlerts.length === 1 ? '' : 'ies'} affecting this ${scopeLabel}`,
    );
  }

  if (localAlerts.length) {
    summaryParts.push(
      `${localAlerts.length} site-specific water advisory${localAlerts.length === 1 ? '' : 'ies'} affecting this ${scopeLabel}`,
    );
  }

  return {
    ...parentAlert,
    value: includeInScore ? waterAlerts.length : 0,
    riskLevel: includeInScore ? (publicAlerts.length ? 'high' : localAlerts.length ? 'moderate' : 'low') : 'low',
    summary: summaryParts.length ? summaryParts.join(' · ') : `No drinking-water advisories affecting this ${scopeLabel}`,
    details: waterAlerts.slice(0, 4).map((alert) => alert.title),
  };
}

function buildAreaWildfireAlert(parentAlert: CategoryAlert, wildfireAlerts: AlertDetail[], scopeLabel: string): CategoryAlert {
  return {
    ...parentAlert,
    value: wildfireAlerts.length,
    riskLevel: wildfireAlerts.length ? 'high' : 'low',
    summary: wildfireAlerts.length
      ? `${wildfireAlerts.length} active wildfire${wildfireAlerts.length === 1 ? '' : 's'} inside this ${scopeLabel}`
      : `No active wildfires inside this ${scopeLabel}`,
    details: wildfireAlerts.slice(0, 3).map((alert) => alert.title),
  };
}

function buildAreaHealthAlert(parentAlert: CategoryAlert, broaderAlerts: AlertDetail[], scopeLabel: string): CategoryAlert {
  if (!broaderAlerts.length) {
    return {
      ...parentAlert,
      value: 0,
      riskLevel: 'low',
      summary: `No broader public-health bulletins linked to this ${scopeLabel}`,
      details: [],
    };
  }

  return {
    ...parentAlert,
    value: broaderAlerts.length,
    riskLevel: broaderAlerts[0].riskLevel,
    summary: broaderAlerts[0].title,
    details: broaderAlerts.slice(0, 3).map((alert) => alert.title),
  };
}

function buildAreaVectorAlert(parentAlert: CategoryAlert, temperatureC: number, parentRegionId: SubRegion['parentRegionId']): CategoryAlert {
  const riskLevel = getVectorRiskLevel(temperatureC, parentRegionId);

  return {
    ...parentAlert,
    value: temperatureC,
    riskLevel,
    summary:
      riskLevel === 'high'
        ? 'Active mosquito and tick pressure in this area'
        : riskLevel === 'moderate'
          ? 'Seasonal vector activity is elevated in this area'
          : 'Seasonal vector activity is currently low in this area',
    details: [`Area-center temperature: ${Math.round(temperatureC)}C`],
  };
}

function toSnapshotAreaFromZone(zone: SubRegion): SnapshotArea {
  return {
    label: zone.name,
    shortLabel: zone.shortName,
    description: zone.populationNote,
    parentRegionId: zone.parentRegionId,
    center: zone.center,
    polygon: zone.polygon,
    scopeLabel: 'zone',
  };
}

function toSnapshotAreaFromLocalArea(area: LocalAreaProfile): SnapshotArea {
  return {
    label: area.label,
    shortLabel: area.shortLabel,
    description: area.description,
    parentRegionId: area.parentRegionId,
    center: area.center,
    polygon: area.polygon,
    scopeLabel: 'local area',
  };
}

function buildAreaSnapshot(
  area: SnapshotArea,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
  overrides: SnapshotOverrides = {},
  waterAreaMode: WaterAreaMode = 'polygon',
  includeWaterInScore = true,
): LocalizedSnapshotResult {
  const coordinateBackedAlerts = [
    ...mapLocationAlerts.filter((alert) => alert.coordinates),
    ...rawAlertDetails.filter((alert) => alert.coordinates && alert.category !== 'water'),
  ];
  const exactAlerts = filterAlertsInsideArea(area, coordinateBackedAlerts, waterAreaMode).sort(compareAlerts);
  const waterAlerts = exactAlerts.filter((alert) => alert.category === 'water');
  const wildfireAlerts = exactAlerts.filter((alert) => alert.category === 'wildfire');
  const broaderAlerts = rawAlertDetails
    .filter(
      (alert) =>
        !alert.coordinates &&
        alert.category === 'healthAdvisories' &&
        alert.regionIds.includes(area.parentRegionId),
    )
    .sort(compareAlerts);

  const weatherAlert = overrides.weatherAlert ?? parentSnapshot.alerts.weather;
  const airAlert = overrides.airAlert ?? parentSnapshot.alerts.airQuality;
  const temperatureC =
    typeof weatherAlert.value === 'number'
      ? weatherAlert.value
      : typeof parentSnapshot.alerts.weather.value === 'number'
        ? parentSnapshot.alerts.weather.value
        : 0;

  const alerts: RegionSnapshot['alerts'] = {
    weather: weatherAlert,
    airQuality: airAlert,
    wildfire: buildAreaWildfireAlert(parentSnapshot.alerts.wildfire, wildfireAlerts, area.scopeLabel),
    water: buildAreaWaterAlert(parentSnapshot.alerts.water, waterAlerts, area.scopeLabel, includeWaterInScore),
    vectorBorne: buildAreaVectorAlert(parentSnapshot.alerts.vectorBorne, temperatureC, area.parentRegionId),
    healthAdvisories: buildAreaHealthAlert(parentSnapshot.alerts.healthAdvisories, broaderAlerts, area.scopeLabel),
  };

  return {
    snapshot: {
      region: {
        ...parentSnapshot.region,
        label: area.label,
        shortLabel: area.shortLabel,
        description: area.description,
        latitude: area.center.latitude,
        longitude: area.center.longitude,
        labelCoordinate: area.center,
        bounds: getPolygonBounds(area.polygon),
        polygon: area.polygon,
      },
      alerts,
      safetyIndex: calculateSafetyIndex(alerts),
      fetchedAt: new Date().toISOString(),
    },
    exactAlerts,
    broaderAlerts,
  };
}

function buildLocalizedSnapshot(
  area: SnapshotArea,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
  waterAreaMode: WaterAreaMode,
  includeWaterInScore: boolean,
) {
  return buildAreaSnapshot(
    area,
    parentSnapshot,
    rawAlertDetails,
    mapLocationAlerts,
    {},
    waterAreaMode,
    includeWaterInScore,
  );
}

async function fetchLocalizedSnapshot(
  area: SnapshotArea,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
  waterAreaMode: WaterAreaMode,
  includeWaterInScore: boolean,
): Promise<LocalizedSnapshotResult> {
  let weatherAlert = parentSnapshot.alerts.weather;
  let airAlert = parentSnapshot.alerts.airQuality;

  try {
    const localLive = await fetchWeatherAndAirQualityForPoint(area.center.latitude, area.center.longitude);
    weatherAlert = localLive.weatherAlert ?? weatherAlert;
    airAlert = localLive.airAlert ?? airAlert;
  } catch {
  }

  return buildAreaSnapshot(area, parentSnapshot, rawAlertDetails, mapLocationAlerts, {
    weatherAlert,
    airAlert,
  }, waterAreaMode, includeWaterInScore);
}

export function buildZoneSnapshotPreview(
  zone: SubRegion,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
) {
  return buildLocalizedSnapshot(
    toSnapshotAreaFromZone(zone),
    parentSnapshot,
    rawAlertDetails,
    mapLocationAlerts,
    'polygon',
    false,
  );
}

export function buildLocalAreaSnapshotPreview(
  area: LocalAreaProfile,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
) {
  return buildLocalizedSnapshot(
    toSnapshotAreaFromLocalArea(area),
    parentSnapshot,
    rawAlertDetails,
    mapLocationAlerts,
    'point',
    true,
  );
}

export async function fetchZoneSnapshot(
  zone: SubRegion,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
): Promise<LocalizedSnapshotResult> {
  return fetchLocalizedSnapshot(
    toSnapshotAreaFromZone(zone),
    parentSnapshot,
    rawAlertDetails,
    mapLocationAlerts,
    'polygon',
    false,
  );
}

export async function fetchLocalAreaSnapshot(
  area: LocalAreaProfile,
  parentSnapshot: RegionSnapshot,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
): Promise<LocalizedSnapshotResult> {
  return fetchLocalizedSnapshot(
    toSnapshotAreaFromLocalArea(area),
    parentSnapshot,
    rawAlertDetails,
    mapLocationAlerts,
    'point',
    true,
  );
}
