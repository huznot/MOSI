import { CATEGORY_META, MANITOBA_POPULATION_CENTERS, PREDICTION_CACHE_TTL_MS, STORAGE_KEYS } from '../constants/config';
import {
  CategoryId,
  CategoryPrediction,
  ManitobaRegion,
  PredictionBundle,
  PredictionDay,
  PredictionDayDetail,
  RegionId,
  RegionSnapshot,
  RiskLevel,
} from '../types/alerts';
import { calculateSafetyIndex, riskLevelToNumber, scoreToRiskLevel } from './safetyIndex';
import { readCache, readFreshCache, writeCache } from './serviceUtils';
import { fetchOpenMeteoForecast, OpenMeteoDayRow } from './openMeteoService';
import {
  estimateSeasonalGDD,
  getAedesBorealFactor,
  getBaselineForWeek,
  getCxTarsalisDiapauseFactor,
  getIxodesQuestingTemperatureFactor,
  getIxodesSeasonFactor,
  getWeekOfYear,
} from './phacBaseline';
import { toDisplayedMosiScore } from '../utils/risk';

type PredictionTarget = {
  id: string;
  latitude: number;
  longitude: number;
};

export const PREDICTION_MODEL_VERSION = '2026-04-06-vector-boreal-jcv-shhv-v3';

type WildfireExposureContext = {
  nearestPopulationLabel: string;
  nearestPopulationDistanceKm: number;
  nearestPopulationDensity: number;
  weatherExposureFactor: number;
  liveFireExposureFactor: number;
  isUrbanArea: boolean;
  isUrbanCore: boolean;
};

const DETAIL_CATEGORY_ORDER: CategoryId[] = [
  'weather',
  'airQuality',
  'wildfire',
  'vectorBorne',
  'water',
  'healthAdvisories',
];

const PRIMARY_FORECAST_CATEGORIES: CategoryId[] = ['weather', 'airQuality', 'wildfire', 'vectorBorne'];
const VECTOR_TRAP_BAND_THRESHOLDS = {
  lowToModerate: 1.66,
  moderateToHigh: 1.90,
} as const;
const CX_TARSALIS_HABITAT_SUITABILITY: Record<RegionId, number> = {
  winnipeg: 0.9,
  southern: 1.0,
  eastern: 0.7,
  western: 0.85,
  northern: 0.08,
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

type VectorScoreParts = {
  mosquitoComparableScore: number;
  overallScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function vectorScoreToRiskLevel(score: number): RiskLevel {
  if (score >= VECTOR_TRAP_BAND_THRESHOLDS.moderateToHigh) return 'high';
  if (score >= VECTOR_TRAP_BAND_THRESHOLDS.lowToModerate) return 'moderate';
  return 'low';
}

function fillNullSeries(values: Array<number | null>, fallback = 0) {
  let previous = fallback;
  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) return previous;
    previous = value;
    return value;
  });
}

function getLivePredictionSignalPart(value: string | number) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }

  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function getPredictionCacheKey(target: PredictionTarget, snapshot: RegionSnapshot) {
  const airQuality = snapshot.alerts.airQuality;
  const wildfire = snapshot.alerts.wildfire;
  const water = snapshot.alerts.water;
  const health = snapshot.alerts.healthAdvisories;
  const liveSignal = [
    `aq_${airQuality.riskLevel}_${getLivePredictionSignalPart(airQuality.value)}`,
    `wf_${wildfire.riskLevel}_${getLivePredictionSignalPart(wildfire.value)}`,
    `wa_${water.riskLevel}_${getLivePredictionSignalPart(water.value)}`,
    `ha_${health.riskLevel}_${getLivePredictionSignalPart(health.value)}`,
  ].join(':');

  return `${STORAGE_KEYS.predictions}:${PREDICTION_MODEL_VERSION}:${target.id}:${liveSignal}`;
}

function getConfidenceLabel(index: number) {
  if (index <= 1) return 'Higher confidence';
  if (index <= 4) return 'Moderate confidence';
  return 'Lower confidence';
}

function getPrimaryDrivers(categoryScores: Record<CategoryId, number>) {
  return [...PRIMARY_FORECAST_CATEGORIES]
    .sort((left, right) => categoryScores[right] - categoryScores[left])
    .slice(0, 2);
}

function isSnowWeatherCode(code: number) {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function getWildfireSeasonWeight(month: number) {
  if (month >= 5 && month <= 9) return 1.0;
  if (month === 4 || month === 10) return 0.5;
  if (month === 3 || month === 11) return 0.25;
  return 0.12;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildWildfireExposureContext(target: PredictionTarget, snapshot: RegionSnapshot): WildfireExposureContext {
  const regionalCenters = MANITOBA_POPULATION_CENTERS.filter((center) => center.regionId === snapshot.region.id);
  const candidates = regionalCenters.length ? regionalCenters : MANITOBA_POPULATION_CENTERS;
  const nearest = [...candidates].sort(
    (left, right) =>
      getDistanceKm(target.latitude, target.longitude, left.latitude, left.longitude) -
      getDistanceKm(target.latitude, target.longitude, right.latitude, right.longitude),
  )[0];
  const nearestPopulationDistanceKm = nearest
    ? getDistanceKm(target.latitude, target.longitude, nearest.latitude, nearest.longitude)
    : Number.POSITIVE_INFINITY;
  const nearestPopulationDensity = nearest?.density ?? 0;
  const densityFactor = clamp((nearestPopulationDensity - 180) / 900, 0, 1);
  const proximityFactor = clamp(
    1 - nearestPopulationDistanceKm / (snapshot.region.id === 'winnipeg' ? 28 : 18),
    0,
    1,
  );
  const builtAreaIndex = densityFactor * proximityFactor;
  const isUrbanCore =
    snapshot.region.id === 'winnipeg' &&
    nearestPopulationDensity >= 900 &&
    nearestPopulationDistanceKm <= 30;
  const isUrbanArea =
    isUrbanCore || builtAreaIndex >= 0.22 || (nearestPopulationDensity >= 250 && nearestPopulationDistanceKm <= 16);

  return {
    nearestPopulationLabel: nearest?.label ?? snapshot.region.label,
    nearestPopulationDistanceKm,
    nearestPopulationDensity,
    weatherExposureFactor: isUrbanCore ? 0.02 : isUrbanArea ? clamp(1 - builtAreaIndex * 0.82, 0.15, 1) : 1,
    liveFireExposureFactor: isUrbanCore ? 0.1 : isUrbanArea ? clamp(1 - builtAreaIndex * 0.55, 0.35, 1) : 1,
    isUrbanArea,
    isUrbanCore,
  };
}

function wmoIcon(code: number): string {
  if (code === 0) return 'weather-sunny';
  if (code <= 3) return 'weather-partly-cloudy';
  if (code === 45 || code === 48) return 'weather-fog';
  if (code >= 51 && code <= 57) return 'weather-rainy';
  if (code >= 61 && code <= 67) return 'weather-pouring';
  if (code >= 71 && code <= 77) return 'weather-snowy';
  if (code >= 80 && code <= 82) return 'weather-rainy';
  if (code === 85 || code === 86) return 'weather-snowy';
  if (code >= 95) return 'weather-lightning-rainy';
  return 'weather-partly-cloudy';
}

function wmoSummary(code: number, highC: number, lowC: number): string {
  let condition: string;
  if (code === 0) condition = 'Clear sky';
  else if (code === 1) condition = 'Mainly clear';
  else if (code === 2) condition = 'Partly cloudy';
  else if (code === 3) condition = 'Overcast';
  else if (code === 45 || code === 48) condition = 'Fog';
  else if (code >= 51 && code <= 53) condition = 'Drizzle';
  else if (code === 55 || code === 56 || code === 57) condition = 'Freezing drizzle';
  else if (code >= 61 && code <= 63) condition = 'Rain';
  else if (code === 65 || code === 66 || code === 67) condition = 'Heavy rain';
  else if (code >= 71 && code <= 73) condition = 'Snow';
  else if (code >= 75 && code <= 77) condition = 'Heavy snow';
  else if (code >= 80 && code <= 82) condition = 'Rain showers';
  else if (code === 85 || code === 86) condition = 'Snow showers';
  else if (code === 95) condition = 'Thunderstorm';
  else if (code === 96 || code === 99) condition = 'Thunderstorm with hail';
  else condition = 'Variable conditions';
  return `${condition}. High ${Math.round(highC)}C, low ${Math.round(lowC)}C.`;
}

function scoreWeatherRisk(row: OpenMeteoDayRow): number {
  const { highC, lowC, precipMm, windKmh, weatherCode } = row;

  const coldScore =
    lowC < -25 ? 1.0
    : lowC < -15 ? 0.5 + (((-15) - lowC) / 10) * 0.5
    : lowC < -5  ? (((-5) - lowC) / 10) * 0.5
    : 0;

  const heatScore =
    highC >= 32 ? 1.0
    : highC >= 27 ? ((highC - 27) / 5)
    : 0;

  const precipScore =
    precipMm >= 50 ? 1.0
    : precipMm >= 10 ? (precipMm - 10) / 40
    : 0;

  const windScore =
    windKmh >= 70 ? 1.0
    : windKmh >= 40 ? 0.5 + ((windKmh - 40) / 30) * 0.5
    : 0;

  const stormScore =
    weatherCode >= 95 ? 1.0
    : (weatherCode >= 71 && weatherCode <= 77) ? 0.75
    : 0;

  const allSub = [coldScore, heatScore, precipScore, windScore, stormScore];
  const dominant = Math.max(...allSub);
  const secondary = allSub.filter((v) => v !== dominant).reduce((sum, v) => sum + v * 0.15, 0);
  const raw = clamp(dominant + secondary, 0, 1);

  return clamp(1.0 + raw * 2.0, 1, 3);
}

function scoreAirQualityTrend(rows: OpenMeteoDayRow[], currentAqhi: number): number[] {

  const anchorScore = clamp(1.0 + ((currentAqhi - 1) / 9) * 2.0, 1, 3);

  const scores: number[] = [anchorScore];
  let running = anchorScore;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    let delta = 0;

    if (row.highC > 25 && row.windKmh < 15 && row.cloudCoverPct < 30) {
      delta += 0.25;
    } else if (row.highC > 25 && row.windKmh < 15) {
      delta += 0.1;
    }

    if (row.windKmh > 30) delta -= 0.15;

    if (row.precipMm > 2) delta -= 0.20;

    delta = clamp(delta, -0.5, 0.5);
    running = clamp(running + delta, 1, 3);
    scores.push(running);
  }

  return scores;
}

function scoreWildfireProxy(
  row: OpenMeteoDayRow,
  dryDayCount: number,
  liveWildfireScore: number,
  exposureContext: WildfireExposureContext,
): number {
  const { highC, lowC, precipMm, windKmh, uvIndex, cloudCoverPct, weatherCode, isoDate } = row;
  const forecastDate = new Date(isoDate);
  const month = Number.isNaN(forecastDate.getTime()) ? new Date().getMonth() + 1 : forecastDate.getMonth() + 1;
  const averageTempC = (highC + lowC) / 2;
  const snowSignal = isSnowWeatherCode(weatherCode);
  const frozenSignal = averageTempC <= 0 || highC <= 4 || lowC <= -6;

  const tempFactor = clamp((highC - 10) / 25, 0, 1);
  const humidityProxy = clamp(1 - cloudCoverPct / 100, 0, 1);
  const windFactor = clamp(windKmh / 60, 0, 1);

  let ffmc = tempFactor * 0.4 + humidityProxy * 0.3 + windFactor * 0.3;

  if (precipMm >= 10) ffmc *= 0.2;
  else if (precipMm >= 2) ffmc *= 0.6;

  const buildUp = clamp(dryDayCount / 7, 0, 1) * 0.3;

  const proximityBoost = ((liveWildfireScore - 1) / 2) * 0.5;

  const uvFactor = clamp(uvIndex / 10, 0, 1) * 0.1;

  const seasonWeight = getWildfireSeasonWeight(month);
  const weatherSuppression = snowSignal ? 0.15 : frozenSignal ? 0.35 : 1.0;
  const liveFireSuppression = snowSignal ? 0.45 : frozenSignal ? 0.65 : 1.0;
  const weatherDrivenRaw = clamp(ffmc + buildUp + uvFactor, 0, 1);
  const raw = clamp(
    weatherDrivenRaw * seasonWeight * weatherSuppression * exposureContext.weatherExposureFactor +
      proximityBoost * liveFireSuppression * exposureContext.liveFireExposureFactor,
    0,
    1,
  );

  let score = clamp(1.0 + raw * 2.0, 1, 3);

  if (exposureContext.isUrbanCore && (snowSignal || frozenSignal || month <= 4 || month >= 11) && liveWildfireScore <= 2) {
    return 1.0;
  }

  if (exposureContext.isUrbanArea && highC <= 5 && liveWildfireScore <= 1.5) {
    score = 1.0;
  }

  if (month >= 5 && month <= 9 && score < 1.1) score = 1.1;

  return score;
}

function computeDryDayCounts(rows: OpenMeteoDayRow[]): number[] {
  const counts: number[] = [];
  let streak = 0;
  for (const row of rows) {
    if (row.precipMm < 2) {
      streak++;
    } else {
      streak = 0;
    }
    counts.push(streak);
  }
  return counts;
}

function vectorTempModifier(avgTemp: number): number {
  if (avgTemp < 5) return 0.0;
  if (avgTemp < 10) return ((avgTemp - 5) / 5) * 0.3;
  if (avgTemp < 18) return 0.3 + ((avgTemp - 10) / 8) * 0.4;
  if (avgTemp < 28) return 0.7 + ((avgTemp - 18) / 10) * 0.3;
  if (avgTemp < 34) return 1.0;
  return clamp(1.0 - ((avgTemp - 34) / 10) * 0.3, 0, 1);
}

function vectorPrecipModifier(precipMm: number): number {
  if (precipMm < 2) return 0.10;
  if (precipMm < 5) return 0.10 + ((precipMm - 2) / 3) * 0.30;
  if (precipMm < 20) return 0.40 + ((precipMm - 5) / 15) * 0.60;
  if (precipMm < 50) return 1.0;
  return clamp(1.0 - ((precipMm - 50) / 50) * 0.4, 0.6, 1);
}

function vectorGddModifier(cumulativeGDD: number): number {
  if (cumulativeGDD < 42)  return (cumulativeGDD / 42) * 0.1;
  if (cumulativeGDD < 109) return 0.1 + ((cumulativeGDD - 42) / 67) * 0.4;
  if (cumulativeGDD < 252) return 0.5 + ((cumulativeGDD - 109) / 143) * 0.5;
  return 1.0;
}

function scoreVectorBorne(
  row: OpenMeteoDayRow,
  weekOfYear: number,
  cumulativeGDD: number,
  regionId: RegionId,
): VectorScoreParts {
  const avgTemp = (row.highC + row.lowC) / 2;
  const forecastYear = parseInt(row.isoDate.substring(0, 4), 10);
  const { normalizedRisk: wnvBaseline, seasonActive: wnvSeasonActive } = getBaselineForWeek(weekOfYear);
  const tickSeasonFactor = getIxodesSeasonFactor(weekOfYear);
  const tickTempFactor = getIxodesQuestingTemperatureFactor(avgTemp);
  const mosquitoHabitat = CX_TARSALIS_HABITAT_SUITABILITY[regionId];
  const tickRegionBoost = (regionId === 'eastern' || regionId === 'southern' || regionId === 'winnipeg') ? 0.12 : 0;
  const borealHabitat = AEDES_BOREAL_SUITABILITY[regionId];

  const aedesBorealRaw = getAedesBorealFactor(avgTemp, weekOfYear, forecastYear) * borealHabitat;
  const combinedSeasonActive = wnvSeasonActive || tickSeasonFactor > 0 || aedesBorealRaw > 0.01;

  if (!combinedSeasonActive) {

    const mosquitoComparableScore = clamp(1.0 + clamp(wnvBaseline * mosquitoHabitat, 0, 0.03) * 2.0, 1, 3);
    return {
      mosquitoComparableScore,
      overallScore: mosquitoComparableScore,
    };
  }

  const suppressedWnvBaseline = wnvBaseline * getCxTarsalisDiapauseFactor(weekOfYear);
  const mosquitoTempMod = vectorTempModifier(avgTemp);
  const pMod = vectorPrecipModifier(row.precipMm);
  const gMod = vectorGddModifier(cumulativeGDD);
  const mosquitoWeatherScore = (mosquitoTempMod + pMod + gMod) / 3.0;
  const mosquitoComparableRisk = suppressedWnvBaseline * mosquitoHabitat * (0.45 + 0.55 * mosquitoWeatherScore);

  const tickComponent = tickSeasonFactor * clamp(tickTempFactor + tickRegionBoost, 0, 1);

  const w = VECTOR_COMPONENT_WEIGHTS[regionId];

  const finalRisk = clamp(
    w.wnv * mosquitoComparableRisk + w.tick * tickComponent + w.boreal * aedesBorealRaw,
    0, 1,
  );

  return {
    mosquitoComparableScore: clamp(1.0 + mosquitoComparableRisk * 2.0, 1, 3),
    overallScore: clamp(1.0 + finalRisk * 2.0, 1, 3),
  };
}

function buildLivePrediction(category: CategoryId, snapshot: RegionSnapshot): CategoryPrediction {
  const alert = snapshot.alerts[category];
  return {
    category,
    sourceType: 'live',
    summary: 'Live advisory only. No forecast available.',
    values: Array.from({ length: 7 }, () => riskLevelToNumber(alert.riskLevel)),
    riskLevels: Array.from({ length: 7 }, () => alert.riskLevel),
  };
}

function buildForecastPrediction(
  category: CategoryId,
  summary: string,
  values: number[],
  mapRiskLevel: (value: number) => RiskLevel = scoreToRiskLevel,
): CategoryPrediction {
  return {
    category,
    sourceType: 'forecast',
    summary,
    values,
    riskLevels: values.map((value) => mapRiskLevel(value)),
  };
}

function buildForecastDays(rows: OpenMeteoDayRow[], categories: Record<CategoryId, CategoryPrediction>): PredictionDay[] {
  return rows.map((row, index) => {
    const predictedAlerts = {
      weather: {
        category: 'weather' as CategoryId,
        value: categories.weather.values[index],
        riskLevel: categories.weather.riskLevels[index],
        summary: wmoSummary(row.weatherCode, row.highC, row.lowC),
        source: 'Open-Meteo',
        lastUpdated: row.isoDate,
      },
      airQuality: {
        category: 'airQuality' as CategoryId,
        value: categories.airQuality.values[index],
        riskLevel: categories.airQuality.riskLevels[index],
        summary: categories.airQuality.summary,
        source: 'Open-Meteo trend',
        lastUpdated: row.isoDate,
      },
      wildfire: {
        category: 'wildfire' as CategoryId,
        value: categories.wildfire.values[index],
        riskLevel: categories.wildfire.riskLevels[index],
        summary: categories.wildfire.summary,
        source: 'FWI-proxy',
        lastUpdated: row.isoDate,
      },
      water: {
        category: 'water' as CategoryId,
        value: categories.water.values[index],
        riskLevel: categories.water.riskLevels[index],
        summary: categories.water.summary,
        source: 'Live',
        lastUpdated: row.isoDate,
      },
      vectorBorne: {
        category: 'vectorBorne' as CategoryId,
        value: categories.vectorBorne.values[index],
        riskLevel: categories.vectorBorne.riskLevels[index],
        summary: categories.vectorBorne.summary,
        source: 'Biological model',
        lastUpdated: row.isoDate,
      },
      healthAdvisories: {
        category: 'healthAdvisories' as CategoryId,
        value: categories.healthAdvisories.values[index],
        riskLevel: categories.healthAdvisories.riskLevels[index],
        summary: categories.healthAdvisories.summary,
        source: 'Live',
        lastUpdated: row.isoDate,
      },
    } as const;

    const rowDate = new Date(row.isoDate + 'T12:00:00');
    const safetyIndex = calculateSafetyIndex(predictedAlerts, getWeekOfYear(rowDate));
    const label = new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(rowDate);

    return {
      isoDate: row.isoDate + 'T12:00:00.000Z',
      label,
      summary: wmoSummary(row.weatherCode, row.highC, row.lowC),
      icon: wmoIcon(row.weatherCode),
      highC: row.highC,
      lowC: row.lowC,
      score: safetyIndex.overallScore,
      riskLevel: safetyIndex.overallRisk,
    };
  });
}

function buildPredictionDayDetails(
  snapshot: RegionSnapshot,
  rows: OpenMeteoDayRow[],
  days: PredictionDay[],
  categories: Record<CategoryId, CategoryPrediction>,
  wildfireExposureContext: WildfireExposureContext,
): Record<string, PredictionDayDetail> {
  const mosiSeries = days.map((day) => day.score);
  const highTemperatureSeries = fillNullSeries(rows.map((row) => row.highC), rows[0]?.highC ?? 0);
  const lowTemperatureSeries = fillNullSeries(rows.map((row) => row.lowC), rows[0]?.lowC ?? 0);

  return rows.reduce<Record<string, PredictionDayDetail>>((acc, row, index) => {
    const isoKey = days[index].isoDate;
    const categoryScores = DETAIL_CATEGORY_ORDER.reduce<Record<CategoryId, number>>((cur, cat) => {
      cur[cat] = categories[cat].values[index] ?? categories[cat].values[0] ?? 1;
      return cur;
    }, {} as Record<CategoryId, number>);
    const categoryRiskLevels = DETAIL_CATEGORY_ORDER.reduce<Record<CategoryId, RiskLevel>>((cur, cat) => {
      cur[cat] = categories[cat].riskLevels[index] ?? categories[cat].riskLevels[0] ?? 'low';
      return cur;
    }, {} as Record<CategoryId, RiskLevel>);

    const topDriverCategories = getPrimaryDrivers(categoryScores);
    const topDrivers = topDriverCategories.map((cat) => CATEGORY_META[cat].label);
    const headline =
      topDriverCategories.length && categoryScores[topDriverCategories[0]] >= 1.7
        ? `${topDrivers.join(' and ')} drive the outlook`
        : 'Mixed background conditions expected';

    const narrative =
      `${wmoSummary(row.weatherCode, row.highC, row.lowC)} ` +
      `Wind up to ${Math.round(row.windKmh)} km/h, UV index ${row.uvIndex.toFixed(1)}, ` +
      `precipitation ${row.precipMm.toFixed(1)} mm. ` +
      `The main contributors to this outlook are ${topDrivers.join(' and ').toLowerCase() || 'background conditions'}. ` +
      'Water and health advisories remain live-only categories and are not forecasted.';

    acc[isoKey] = {
      isoDate: isoKey,
      headline,
      narrative,
      confidenceLabel: getConfidenceLabel(index),
      categoryScores,
      categoryRiskLevels,
      drivers: [
        {
          title: 'Weather setup',
          detail: `${wmoSummary(row.weatherCode, row.highC, row.lowC)} Wind up to ${Math.round(row.windKmh)} km/h. The weather signal grades ${scoreToRiskLevel(categoryScores.weather)} for MOSI. Source: Open-Meteo 7-day forecast.`,
        },
        {
          title: 'Air-quality trend estimate',
          detail: `AQHI trend is anchored to the current live reading (${snapshot.alerts.airQuality.value ?? 'N/A'}) and adjusted using forecast wind and precipitation. This is a directional trend estimate, not an official AQHI forecast.`,
        },
        {
          title: 'Wildfire estimate (MOSI model)',
          detail: `MOSI's own estimate, not an official fire danger rating. It uses FFMC proxy from temperature, humidity, and wind; DMC proxy from consecutive dry-day streak (${row.precipMm < 2 ? 'ongoing' : 'reset today'}); proximity boost from live CWFIS fire data; winter suppression when conditions stay frozen or snowy; and built-area suppression around ${wildfireExposureContext.nearestPopulationLabel} when the target sits in a dense urban catchment.`,
        },
        {
          title: 'Tick and mosquito estimate (MOSI model)',
          detail: `This is MOSI's own estimate, not an official forecast. It blends a seasonal mosquito curve with a separate tick activity model that is strongest in cool spring conditions, weaker in hot late summer, and returns as a smaller fall shoulder. It reflects likely vector pressure rather than a site-specific disease prediction. Average temperature ${Math.round((row.highC + row.lowC) / 2)} C suggests ${vectorScoreToRiskLevel(categoryScores.vectorBorne)} pressure.`,
        },
        {
          title: 'Reactive-only signals',
          detail: `Water and health remain live-status indicators only. Current states: ${snapshot.alerts.water.riskLevel} for water, ${snapshot.alerts.healthAdvisories.riskLevel} for health advisories.`,
        },
      ],
      chartSeries: [
        { label: 'Overall Risk (0-3)', values: mosiSeries.map((value) => toDisplayedMosiScore(value)) },
        { label: 'High Temp (C)', values: highTemperatureSeries },
        { label: 'Low Temp (C)', values: lowTemperatureSeries },
        { label: 'Air Quality Risk (0-3)', values: categories.airQuality.values.map((value) => toDisplayedMosiScore(value)) },
        { label: 'Wildfire Risk (0-3)', values: categories.wildfire.values.map((value) => toDisplayedMosiScore(value)) },
        { label: 'Vector-Borne Risk (0-3)', values: categories.vectorBorne.values.map((value) => toDisplayedMosiScore(value)) },
      ],
    };

    return acc;
  }, {});
}

function isDetailedPredictionBundle(bundle: PredictionBundle | null | undefined): bundle is PredictionBundle {
  if (!bundle || bundle.modelVersion !== PREDICTION_MODEL_VERSION || !bundle.days.length || !bundle.dayDetails) {
    return false;
  }
  return bundle.days.every((day) => Boolean(bundle.dayDetails[day.isoDate]));
}

function buildFallbackRows(snapshot: RegionSnapshot): OpenMeteoDayRow[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      isoDate: date.toISOString().slice(0, 10),
      highC: 0,
      lowC: -5,
      precipMm: 0,
      windKmh: 15,
      uvIndex: 1,
      weatherCode: 2,
      cloudCoverPct: 50,
    };
  });
}

function buildPredictionBundle(target: PredictionTarget, snapshot: RegionSnapshot, openMeteoRows: OpenMeteoDayRow[]): PredictionBundle {
  const currentAqhi = typeof snapshot.alerts.airQuality.value === 'number' ? snapshot.alerts.airQuality.value : 3;
  const liveWildfireScore = riskLevelToNumber(snapshot.alerts.wildfire.riskLevel);
  const wildfireExposureContext = buildWildfireExposureContext(target, snapshot);
  const dryDayCounts = computeDryDayCounts(openMeteoRows);

  const today = new Date();
  const startWeek = getWeekOfYear(today);
  const baseGDD = estimateSeasonalGDD(startWeek);
  let runningGDD = baseGDD;
  const vectorValues = openMeteoRows.map((row, i) => {

    const dailyGDD = Math.max(0, (row.highC + row.lowC) / 2 - 14.3);
    if (i > 0) runningGDD += dailyGDD;
    const week = startWeek + Math.floor(i / 7);
    return scoreVectorBorne(row, week, runningGDD, snapshot.region.id).overallScore;
  });

  const weatherValues = openMeteoRows.map((row) => scoreWeatherRisk(row));
  const airValues = scoreAirQualityTrend(openMeteoRows, currentAqhi);
  const wildfireValues = openMeteoRows.map((row, i) =>
    scoreWildfireProxy(row, dryDayCounts[i], liveWildfireScore, wildfireExposureContext),
  );

  const categories: Record<CategoryId, CategoryPrediction> = {
    weather: buildForecastPrediction(
      'weather',
      'Real 7-day forecast from Open-Meteo (temperature, wind, precipitation, WMO weather code).',
      weatherValues,
    ),
    airQuality: buildForecastPrediction(
      'airQuality',
      'AQHI trend estimate: live observation adjusted by forecast wind and precipitation signals.',
      airValues,
    ),
    wildfire: buildForecastPrediction(
      'wildfire',
      'MOSI estimate (not an official fire danger rating): temperature, humidity, wind, dry days and nearby CWFIS fires.',
      wildfireValues,
    ),
    water: buildLivePrediction('water', snapshot),
    vectorBorne: buildForecastPrediction(
      'vectorBorne',
      'MOSI estimate (not an official forecast) of mosquito and tick activity from the season and forecast temperatures.',
      vectorValues,
      vectorScoreToRiskLevel,
    ),
    healthAdvisories: buildLivePrediction('healthAdvisories', snapshot),
  };

  const days = buildForecastDays(openMeteoRows, categories);
  const dayDetails = buildPredictionDayDetails(snapshot, openMeteoRows, days, categories, wildfireExposureContext);

  return {
    regionId: target.id,
    modelVersion: PREDICTION_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    days,
    dayDetails,
    categories,
    about: [
      'Weather uses the Open-Meteo 7-day forecast for temperature, wind, precipitation, and weather code.',
      'Air quality is a directional trend estimate based on the current AQHI reading plus forecast wind and precipitation. It is not an official AQHI forecast.',
      'Wildfire risk combines forecast fire-weather conditions with current fire proximity and local urban suppression factors.',
      'Vector-borne risk combines Manitoba seasonal mosquito and tick patterns with forecast temperature and precipitation.',
      'Water and health advisories use live status only. No forward forecast is available for these categories.',
    ],
  } satisfies PredictionBundle;
}

function buildFallbackPredictionBundle(target: PredictionTarget, snapshot: RegionSnapshot): PredictionBundle {
  const rows = buildFallbackRows(snapshot);
  const wildfireExposureContext = buildWildfireExposureContext(target, snapshot);
  const categories: Record<CategoryId, CategoryPrediction> = {
    weather: buildLivePrediction('weather', snapshot),
    airQuality: buildLivePrediction('airQuality', snapshot),
    wildfire: buildLivePrediction('wildfire', snapshot),
    water: buildLivePrediction('water', snapshot),
    vectorBorne: buildLivePrediction('vectorBorne', snapshot),
    healthAdvisories: buildLivePrediction('healthAdvisories', snapshot),
  };
  const days = buildForecastDays(rows, categories);
  const dayDetails = buildPredictionDayDetails(snapshot, rows, days, categories, wildfireExposureContext);

  return {
    regionId: target.id,
    modelVersion: PREDICTION_MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    days,
    dayDetails,
    categories,
    about: [
      'Forecast data was unavailable. Live conditions are shown instead.',
    ],
  } satisfies PredictionBundle;
}

export async function fetchPredictionBundle(region: ManitobaRegion, snapshot: RegionSnapshot) {
  return fetchPredictionBundleForTarget(region, snapshot);
}

export async function fetchPredictionBundleForTarget(target: PredictionTarget, snapshot: RegionSnapshot) {
  const cacheKey = getPredictionCacheKey(target, snapshot);
  const freshCache = await readFreshCache<PredictionBundle>(cacheKey, PREDICTION_CACHE_TTL_MS);
  if (freshCache && isDetailedPredictionBundle(freshCache.data)) {
    return freshCache.data;
  }

  try {
    const openMeteoRows = await fetchOpenMeteoForecast(target);
    const bundle =
      openMeteoRows && openMeteoRows.length >= 7
        ? buildPredictionBundle(target, snapshot, openMeteoRows)
        : buildFallbackPredictionBundle(target, snapshot);

    await writeCache(cacheKey, bundle);
    return bundle;
  } catch {
    const cached = await readCache<PredictionBundle>(cacheKey);
    if (cached && isDetailedPredictionBundle(cached.data)) {
      return cached.data;
    }
    return buildFallbackPredictionBundle(target, snapshot);
  }
}
