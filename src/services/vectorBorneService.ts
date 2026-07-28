import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { fetchText, withCacheFallback } from './serviceUtils';
import {
  getAedesBorealFactor,
  getCxTarsalisDiapauseFactor,
  getIxodesQuestingTemperatureFactor,
  getIxodesSeasonFactor,
  getWeekOfYear,
} from './phacBaseline';

function getMosquitoFactor(temperatureC: number): number {
  if (temperatureC < 10) return 0;
  if (temperatureC < 22) return (temperatureC - 10) / 12;
  if (temperatureC <= 32) return 1.0;
  return Math.max(0, 1.0 - ((temperatureC - 32) / 10) * 0.5);
}

const CX_TARSALIS_HABITAT_SUITABILITY: Record<RegionId, number> = {
  winnipeg:  0.90,
  southern:  1.00,
  eastern:   0.70,
  western:   0.85,
  northern:  0.08,
};

const AEDES_BOREAL_SUITABILITY: Record<RegionId, number> = {
  winnipeg: 0.05,
  southern: 0.05,
  eastern:  0.55,
  western:  0.40,
  northern: 1.00,
};

const VECTOR_COMPONENT_WEIGHTS: Record<RegionId, { wnv: number; tick: number; boreal: number }> = {
  winnipeg: { wnv: 0.60, tick: 0.40, boreal: 0.00 },
  southern: { wnv: 0.60, tick: 0.40, boreal: 0.00 },
  eastern:  { wnv: 0.56, tick: 0.38, boreal: 0.06 },
  western:  { wnv: 0.57, tick: 0.37, boreal: 0.06 },
  northern: { wnv: 0.18, tick: 0.30, boreal: 0.52 },
};

export function getVectorRiskLevel(
  temperatureC: number,
  regionId: RegionId,
  weekOfYear?: number,
  year?: number,
): RiskLevel {
  const week = weekOfYear ?? getWeekOfYear(new Date());
  const currentYear = year ?? new Date().getFullYear();
  const diapauseFactor = getCxTarsalisDiapauseFactor(week);
  const tickSeasonFactor = getIxodesSeasonFactor(week);

  const mosquitoFactor = getMosquitoFactor(temperatureC);
  const tickFactor = getIxodesQuestingTemperatureFactor(temperatureC);

  const mosquitoHabitat = CX_TARSALIS_HABITAT_SUITABILITY[regionId];
  const adjustedMosquito = mosquitoFactor * mosquitoHabitat * diapauseFactor;

  const tickRegionBoost = (regionId === 'eastern' || regionId === 'southern' || regionId === 'winnipeg') ? 0.12 : 0;
  const adjustedTick = Math.min(1, (tickFactor + tickRegionBoost) * tickSeasonFactor);

  const borealHabitat = AEDES_BOREAL_SUITABILITY[regionId];
  const adjustedBoreal = getAedesBorealFactor(temperatureC, week, currentYear) * borealHabitat;

  const w = VECTOR_COMPONENT_WEIGHTS[regionId];
  const total = w.wnv * adjustedMosquito + w.tick * adjustedTick + w.boreal * adjustedBoreal;
  if (total >= 0.70) return 'high';
  if (total >= 0.30) return 'moderate';
  return 'low';
}

export async function fetchVectorAlerts(
  regions: ManitobaRegion[],
  tempByRegion: Partial<Record<RegionId, number>> = {},
) {
  const currentWeek = getWeekOfYear(new Date());
  const cacheKey = `${STORAGE_KEYS.vector}:all`;
  const { data } = await withCacheFallback<Record<RegionId, CategoryAlert>>('vector', cacheKey, async () => {
    const tickPage = await fetchText(API_URLS.vectorTick);
    const latestReference = tickPage.match(/tbd_report(\d{4})\.pdf/i)?.[1] ?? '2018';

    const currentYear = new Date().getFullYear();

    return regions.reduce<Record<RegionId, CategoryAlert>>((accumulator, region) => {
      const tempC = tempByRegion[region.id] ?? 0;
      const riskLevel = getVectorRiskLevel(tempC, region.id, currentWeek, currentYear);
      const isBoreal = region.id === 'northern';
      const isBorealTransition = region.id === 'eastern' || region.id === 'western';

      const summaryHigh = isBoreal
        ? 'Peak boreal Aedes activity. Jamestown Canyon Virus and Snowshoe Hare Virus transmission risk is elevated. Use insect repellent and cover exposed skin.'
        : isBorealTransition
          ? 'Elevated mosquito, tick, and boreal vector activity. West Nile virus, Jamestown Canyon Virus, and tick-borne disease risk are all present.'
          : 'Peak mosquito and tick activity. West Nile virus and tick-borne disease risk is elevated in this region.';
      const summaryModerate = isBoreal
        ? 'Seasonal Aedes activity is underway. Jamestown Canyon Virus (JCV) and Snowshoe Hare Virus (SHHV) risk is present — both are significantly underdiagnosed.'
        : isBorealTransition
          ? 'Seasonal vector activity is elevated. Mosquito, tick, and boreal Aedes (JCV/SHHV) exposure risk are all present in the transition zone.'
          : 'Seasonal vector activity is elevated. Both mosquito and tick exposure risk are present.';
      const summaryLow = isBoreal
        ? 'Boreal Aedes activity is currently low. JCV and SHHV risk returns with spring snowmelt — typically May through July.'
        : 'Vector activity is currently low. Continue routine precautions as the season progresses.';

      accumulator[region.id] = {
        category: 'vectorBorne',
        value: tempC,
        riskLevel,
        summary: riskLevel === 'high' ? summaryHigh : riskLevel === 'moderate' ? summaryModerate : summaryLow,
        source: STRINGS.vectorSource,
        sourceUrl: API_URLS.vectorTick,
        lastUpdated: new Date().toISOString(),
        seasonal: true,
        details: isBoreal
          ? [
              'Northern model: JCV/SHHV via Aedes communis/hexodontus/punctor (52% weight) + Ixodes ticks (30%) + WNV/Cx. tarsalis (18%). JCV uses deer reservoir; SHHV modulated by 10-yr snowshoe hare cycle.',
              `Latest linked tick-borne disease report: ${latestReference}`,
            ]
          : [
              'WNV/Cx. tarsalis scaled by regional habitat suitability (Chen et al. 2013) + Ixodes scapularis/I. cookei' + (isBorealTransition ? ' + boreal Aedes (JCV/SHHV) transition zone component' : ''),
              `Latest linked tick-borne disease report: ${latestReference}`,
            ],
        dataStatus: 'seasonal',
      };
      return accumulator;
    }, {} as Record<RegionId, CategoryAlert>);
  });

  return data;
}
