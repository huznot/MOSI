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
    riskLevel: 'moderate',
    summary: 'Data temporarily unavailable',
    source: 'Cached fallback unavailable',
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

  let weatherAir: Awaited<ReturnType<typeof fetchWeatherAndAirQuality>> | null = null;
  try {
    weatherAir = await fetchWeatherAndAirQuality(regions);
  } catch {
    weatherAir = null;
  }

  const tempByRegion: Partial<Record<RegionId, number>> = {};
  if (weatherAir) {
    for (const region of regions) {
      const temp = weatherAir.weatherByRegion[region.id]?.value;
      if (typeof temp === 'number' && Number.isFinite(temp)) {
        tempByRegion[region.id] = temp;
      }
    }
  }

  const results = await Promise.allSettled([
    fetchWildfireAlerts(regions),
    fetchWaterAlerts(regions, userCoordinates, selectedZone ?? null, focusedRegionId),
    fetchVectorAlerts(regions, tempByRegion),
    fetchHealthAlerts(regions),
    fetchMbReadyAlerts(),
  ]);

  const wildfire   = results[0].status === 'fulfilled' ? results[0].value : null;
  const water      = results[1].status === 'fulfilled' ? results[1].value : null;
  const vector     = results[2].status === 'fulfilled' ? results[2].value : null;
  const health     = results[3].status === 'fulfilled' ? results[3].value : null;
  const mbReady    = results[4].status === 'fulfilled' ? results[4].value : [];

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
