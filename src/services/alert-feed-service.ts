import { ALERT_PROXIMITY_KM, CATEGORY_META } from '../constants/config';
import { AlertDetail, CategoryAlert, CategoryId, LocationSource, RegionSnapshot, UserCoordinates } from '../types/alerts';
import { getDistanceKm } from './locationService';
import { waterAreaContainsPoint } from './waterAdvisoryService';

type BuildVisibleAlertsParams = {
  snapshot: RegionSnapshot;
  rawAlertDetails: AlertDetail[];
  selectedFilter: CategoryId | 'all';
  locationSource: LocationSource;
  userCoordinates: UserCoordinates | null;
};

const severityOrder = {
  high: 0,
  moderate: 1,
  low: 2,
} as const;

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

function buildRecommendations(category: CategoryId) {
  if (category === 'weather') {
    return [
      'Layer clothing: a moisture-wicking base, insulating mid-layer, and windproof outer shell.',
      'Limit exposed skin during extreme cold. Frostbite can occur within 10 minutes in severe wind chill.',
      'Know the warning signs of frostbite (numbness, waxy skin) and hypothermia (shivering, confusion).',
      'Identify warm-up locations (libraries, community centres) if you must be outside for extended periods.',
    ];
  }
  if (category === 'airQuality') {
    return [
      'Limit outdoor exercise when AQHI is 4 or higher. Heavy breathing increases particle exposure.',
      'Keep windows and doors closed; use indoor air recirculation on your HVAC if smoke is present.',
      'If you have asthma or a heart condition, keep your rescue inhaler accessible and reduce outdoor time.',
      'AQHI can change quickly. Check again before planned outdoor activity.',
    ];
  }
  if (category === 'vectorBorne') {
    return [
      'Apply Health Canada-approved insect repellent containing DEET or Icaridin to exposed skin.',
      'Wear light-coloured long sleeves and pants when in tall grass, bush, or forest edges.',
      'Perform a thorough tick check within 2 hours of returning indoors. Pay special attention to the scalp, groin, and armpits.',
      'If you find an attached tick, remove it promptly with fine-tipped tweezers and monitor for rash or fever.',
      'See a doctor promptly if a bull\'s-eye rash, fever, or joint pain develops within 30 days of a tick bite.',
    ];
  }
  return [
    'Follow the latest guidance from the issuing authority.',
    'Review the source link for current instructions specific to your situation.',
    'Re-check this alert periodically. Conditions can change as the situation develops.',
  ];
}

function buildSummaryAlertDetail(snapshot: RegionSnapshot, category: CategoryId, alert: CategoryAlert): AlertDetail | null {
  if (alert.riskLevel === 'low' && !/warning|advisory|alert|outbreak/i.test(alert.summary)) {
    return null;
  }

  return {
    id: `summary:${snapshot.region.id}:${category}`,
    category,
    title: `${snapshot.region.label} ${CATEGORY_META[category].label}`,
    summary: alert.summary,
    description: alert.details?.join(' ') || alert.summary,
    source: alert.source,
    sourceUrl: alert.sourceUrl,
    authority: alert.source,
    geographicScope: snapshot.region.label,
    riskLevel: alert.riskLevel,
    issuedAt: alert.lastUpdated,
    updatedAt: alert.lastUpdated,
    regionIds: [snapshot.region.id],
    recommendedActions: buildRecommendations(category),
  };
}

function categoryHasRawDetails(category: CategoryId) {
  return category === 'water' || category === 'wildfire' || category === 'healthAdvisories';
}

function buildSnapshotSummaryAlerts(
  snapshot: RegionSnapshot,
  selectedFilter: CategoryId | 'all',
  includeAllCategories = false,
) {
  return (Object.entries(snapshot.alerts) as [CategoryId, CategoryAlert][])
    .filter(([category]) => (selectedFilter === 'all' ? true : category === selectedFilter))
    .filter(([category]) => includeAllCategories || !categoryHasRawDetails(category))
    .map(([category, alert]) => buildSummaryAlertDetail(snapshot, category, alert))
    .filter(Boolean) as AlertDetail[];
}

export function sortVisibleAlerts(alerts: AlertDetail[]) {
  return [...alerts].sort((left, right) => {
    const severityDelta = severityOrder[left.riskLevel] - severityOrder[right.riskLevel];
    return severityDelta !== 0 ? severityDelta : toSortableTime(right.updatedAt) - toSortableTime(left.updatedAt);
  });
}

function withComputedDistance(alert: AlertDetail, userCoordinates: UserCoordinates) {
  if (!alert.coordinates) {
    return alert;
  }

  const distanceKm = getDistanceKm(
    userCoordinates.latitude,
    userCoordinates.longitude,
    alert.coordinates.latitude,
    alert.coordinates.longitude,
  );

  return {
    ...alert,
    distanceKm,
  };
}

function isLocationRelevant(alert: AlertDetail, regionId: RegionSnapshot['region']['id'], locationSource: LocationSource, userCoordinates: UserCoordinates | null) {
  if (locationSource === 'gps' && userCoordinates && alert.coordinates) {
    const distanceKm = getDistanceKm(
      userCoordinates.latitude,
      userCoordinates.longitude,
      alert.coordinates.latitude,
      alert.coordinates.longitude,
    );

    if (alert.category === 'wildfire') {
      return distanceKm <= ALERT_PROXIMITY_KM.wildfire;
    }

    if (alert.category === 'water') {
      return alert.impactRadiusMetres
        ? waterAreaContainsPoint(alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> }, userCoordinates)
        : distanceKm <= ALERT_PROXIMITY_KM.water;
    }
  }

  return alert.regionIds.includes(regionId);
}

export function buildVisibleAlerts({
  snapshot,
  rawAlertDetails,
  selectedFilter,
  locationSource,
  userCoordinates,
}: BuildVisibleAlertsParams) {
  const detailAlerts = rawAlertDetails
    .filter((alert) => (selectedFilter === 'all' ? true : alert.category === selectedFilter))
    .filter((alert) => isLocationRelevant(alert, snapshot.region.id, locationSource, userCoordinates))
    .map((alert) => (locationSource === 'gps' && userCoordinates ? withComputedDistance(alert, userCoordinates) : alert));

  const summaryAlerts = buildSnapshotSummaryAlerts(snapshot, selectedFilter);

  return sortVisibleAlerts([...detailAlerts, ...summaryAlerts]);
}

export function buildProvinceWideAlerts({
  snapshots,
  rawAlertDetails,
  mapLocationAlerts,
  selectedFilter,
}: {
  snapshots: Record<string, RegionSnapshot>;
  rawAlertDetails: AlertDetail[];
  mapLocationAlerts: AlertDetail[];
  selectedFilter: CategoryId | 'all';
}) {
  const summaryAlerts = Object.values(snapshots).flatMap((snapshot) => buildSnapshotSummaryAlerts(snapshot, selectedFilter));
  const detailAlerts = [...mapLocationAlerts, ...rawAlertDetails].filter((alert) =>
    selectedFilter === 'all' ? true : alert.category === selectedFilter,
  );

  return sortVisibleAlerts([...detailAlerts, ...summaryAlerts]);
}
