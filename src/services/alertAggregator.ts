import { AlertDetail, CategoryAlert, CategoryId, MbReadyAlert, RegionId, RegionSnapshot, RiskLevel } from '../types/alerts';
import { SubRegion } from '../data/manitobaSubRegions';
import { pointInPolygon } from '../data/manitobaGeometry';
import { getAllRegions } from './locationService';
import { fetchHealthAlerts } from './healthAdvisoryService';
import { fetchMbReadyAlerts } from './mbReadyService';
import { getWeekOfYear } from './phacBaseline';
import { calculateSafetyIndex } from './safetyIndex';
import { fetchVectorAlerts } from './vectorBorneService';
import { fetchWaterAlerts, WaterAdvisory } from './waterAdvisoryService';
import { fetchWeatherAndAirQuality } from './weatherAirQualityService';
import { fetchWildfireAlerts } from './wildfireService';

type AggregatedRefreshResult = {
  snapshots: Record<string, RegionSnapshot>;
  alertDetails: AlertDetail[];
  mapLocationAlerts: AlertDetail[];
  waterEnrichmentCandidates: WaterAdvisory[];
  mbReadyAlerts: MbReadyAlert[];
};

const RISK_RANK: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2 };

function riskLevelIsWorse(candidate: RiskLevel, current: RiskLevel): boolean {
  return RISK_RANK[candidate] > RISK_RANK[current];
}

export function createUnavailableAlert(category: CategoryId): CategoryAlert {
  return {
    category,
    value: 'n/a',
    // Unknown is not "moderate": calculateSafetyIndex skips unavailable categories entirely.
    riskLevel: 'low',
    summary: 'Data temporarily unavailable',
    source: 'Source could not be reached',
    lastUpdated: new Date().toISOString(),
    dataStatus: 'unavailable',
  };
}

export async function refreshAllRegionData(
  userCoordinates?: { latitude: number; longitude: number } | null,
  selectedZone?: SubRegion | null,
  focusedRegionId?: RegionId | null,
) {
  const regions = getAllRegions();

  // Every source starts at once; only the vector model waits, because it needs temperatures.
  const weatherAirPromise = fetchWeatherAndAirQuality(regions).catch(() => null);
  const vectorPromise = weatherAirPromise.then((weather) => {
    const tempByRegion: Partial<Record<RegionId, number>> = {};
    for (const region of regions) {
      const temp = weather?.weatherByRegion[region.id]?.value;
      if (typeof temp === 'number' && Number.isFinite(temp)) {
        tempByRegion[region.id] = temp;
      }
    }
    return fetchVectorAlerts(regions, tempByRegion);
  });

  const orNull = <T,>(promise: Promise<T>) => promise.catch(() => null);
  const [weatherAir, wildfire, water, vector, health, mbReadyResult] = await Promise.all([
    weatherAirPromise,
    orNull(fetchWildfireAlerts(regions)),
    orNull(fetchWaterAlerts(regions, userCoordinates, selectedZone ?? null, focusedRegionId)),
    orNull(vectorPromise),
    orNull(fetchHealthAlerts(regions)),
    orNull(fetchMbReadyAlerts()),
  ]);
  const mbReady = mbReadyResult ?? [];

  const mbReadyInsideUser: MbReadyAlert[] = userCoordinates && mbReady.length
    ? mbReady.filter(
        (alert) =>
          alert.polygon &&
          pointInPolygon(userCoordinates.latitude, userCoordinates.longitude, alert.polygon),
      )
    : [];

  const mbReadyWorstSeverity: RiskLevel | null = mbReadyInsideUser.reduce<RiskLevel | null>((worst, alert) => {
    const level: RiskLevel = alert.severity === 'moderate' ? 'moderate' : 'high';
    if (!worst) return level;
    if (worst === 'high') return 'high';
    return level;
  }, null);

  const snapshots = regions.reduce<Record<string, RegionSnapshot>>((accumulator, region) => {
    const alerts = {
      weather: weatherAir?.weatherByRegion[region.id],
      airQuality: weatherAir?.airByRegion[region.id],
      wildfire: wildfire?.byRegion[region.id],
      water: water?.byRegion[region.id],
      vectorBorne: vector?.[region.id],
      healthAdvisories: health?.byRegion[region.id],
    } as RegionSnapshot['alerts'];

    const baseHealthAlert: CategoryAlert =
      alerts.healthAdvisories ?? createUnavailableAlert('healthAdvisories');

    const boostedHealthAlert: CategoryAlert =
      mbReadyWorstSeverity && focusedRegionId && region.id === focusedRegionId
        ? riskLevelIsWorse(mbReadyWorstSeverity, baseHealthAlert.riskLevel)
          ? {
              ...baseHealthAlert,
              riskLevel: mbReadyWorstSeverity,
              dataStatus: 'live',
              summary: [
                mbReadyInsideUser[0]?.headline ?? 'Active government emergency alert in your area',
                baseHealthAlert.summary !== 'Data temporarily unavailable' ? baseHealthAlert.summary : null,
              ]
                .filter(Boolean)
                .join(' | '),
            }
          : baseHealthAlert
        : baseHealthAlert;

    const completeAlerts = {
      weather: alerts.weather ?? createUnavailableAlert('weather'),
      airQuality: alerts.airQuality ?? createUnavailableAlert('airQuality'),
      wildfire: alerts.wildfire ?? createUnavailableAlert('wildfire'),
      water: alerts.water ?? createUnavailableAlert('water'),
      vectorBorne: alerts.vectorBorne ?? createUnavailableAlert('vectorBorne'),
      healthAdvisories: boostedHealthAlert,
    };

    accumulator[region.id] = {
      region,
      alerts: completeAlerts,
      safetyIndex: calculateSafetyIndex(completeAlerts, getWeekOfYear(new Date())),
      fetchedAt: new Date().toISOString(),
    };

    return accumulator;
  }, {});

  const alertDetails = [
    ...(wildfire?.details ?? []),
    ...(water?.details ?? []),
    ...(health?.details ?? []),
  ];

  const mapLocationAlerts = [...(water?.mapDetails ?? [])];
  const waterEnrichmentCandidates = [...(water?.enrichmentCandidates ?? [])];

  return {
    snapshots,
    alertDetails,
    mapLocationAlerts,
    waterEnrichmentCandidates,
    mbReadyAlerts: mbReady,
  } satisfies AggregatedRefreshResult;
}

export async function refreshAllRegionSnapshots() {
  const result = await refreshAllRegionData();
  return result.snapshots;
}
