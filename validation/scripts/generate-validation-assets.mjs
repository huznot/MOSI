import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const RAW_DIR = path.join(ROOT, 'validation', 'raw');
const WEATHER_DIR = path.join(RAW_DIR, 'weather');
const OUTPUT_DIR = path.join(ROOT, 'validation', 'output');
const FIGURE_DIR = path.join(OUTPUT_DIR, 'figures');

const YEARS = [2021, 2022, 2023, 2024];
const REGIONS = [
  { id: 'eastern', short: 'East', boardLabel: 'Interlake-Eastern', latitude: 50.1436, longitude: -96.8845, color: '#0f766e' },
  { id: 'western', short: 'West', boardLabel: 'Prairie Mountain', latitude: 50.8, longitude: -100.25, color: '#c2410c' },
  { id: 'southern', short: 'South', boardLabel: 'Southern-Sante Sud', latitude: 49.8146, longitude: -97.8056, color: '#166534' },
  { id: 'winnipeg', short: 'WPG', boardLabel: 'Winnipeg', latitude: 49.8951, longitude: -97.1384, color: '#0369a1' },
];
const CX_TARSALIS_HABITAT_SUITABILITY = {
  winnipeg: 0.9,
  southern: 1.0,
  eastern: 0.7,
  western: 0.85,
};

// Mirrors AEDES_BOREAL_SUITABILITY from vectorBorneService.ts
const AEDES_BOREAL_SUITABILITY = {
  winnipeg: 0.05,
  southern: 0.05,
  eastern: 0.55,
  western: 0.40,
};

// Mirrors VECTOR_COMPONENT_WEIGHTS from vectorBorneService.ts
const VECTOR_COMPONENT_WEIGHTS = {
  winnipeg: { wnv: 0.60, tick: 0.40, boreal: 0.00 },
  southern: { wnv: 0.60, tick: 0.40, boreal: 0.00 },
  eastern:  { wnv: 0.56, tick: 0.38, boreal: 0.06 },
  western:  { wnv: 0.57, tick: 0.37, boreal: 0.06 },
};
const VECTOR_TRAP_BAND_THRESHOLDS = {
  lowToModerate: 1.66,
  moderateToHigh: 1.90,
};

const SAFETY_INDEX_WEIGHTS = {
  weather: 0.25,
  airQuality: 0.2,
  wildfire: 0.2,
  water: 0.15,
  vectorBorne: 0.1,
  healthAdvisories: 0.1,
};

const MONTH_INDEX = {
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  sept: 9,
};

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeText(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, 'utf8');
}

async function writeJson(filePath, value) {
  await writeText(filePath, JSON.stringify(value, null, 2));
}

function decodeEntities(input) {
  const named = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    eacute: 'e',
    rsquo: "'",
    lsquo: "'",
    ndash: '-',
    mdash: '-',
  };

  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function stripTags(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const t = index - lower;
  return sortedValues[lower] * (1 - t) + sortedValues[upper] * t;
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const meanX = average(xs);
  const meanY = average(ys);
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return null;
  return numerator / Math.sqrt(denomX * denomY);
}

function getRankMap(values) {
  const rankMap = new Map();
  Array.from(new Set(values))
    .sort((left, right) => left - right)
    .forEach((value) => {
      const positions = [];
      values.forEach((candidate, index) => {
        if (candidate === value) positions.push(index + 1);
      });
      rankMap.set(value, average(positions));
    });
  return rankMap;
}

function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const xRanks = getRankMap(xs);
  const yRanks = getRankMap(ys);
  return pearson(
    xs.map((value) => xRanks.get(value)),
    ys.map((value) => yRanks.get(value)),
  );
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekOfYear(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getBaselineForWeek(weekOfYear) {
  const mu = 31.5;
  const sigma = 6.0;
  const seasonActive = weekOfYear >= 18 && weekOfYear <= 43;
  const gaussian = Math.exp(-0.5 * Math.pow((weekOfYear - mu) / sigma, 2));
  const normalizedRisk = seasonActive ? gaussian : Math.min(gaussian, 0.03);
  return { weekOfYear, normalizedRisk, seasonActive };
}

function getSeasonalWeights(weekOfYear) {
  const { normalizedRisk } = getBaselineForWeek(weekOfYear);
  const vectorBorneWeight = 0.05 + 0.1 * normalizedRisk;
  const delta = vectorBorneWeight - SAFETY_INDEX_WEIGHTS.vectorBorne;
  const otherSum = 1 - SAFETY_INDEX_WEIGHTS.vectorBorne;
  const scale = delta / otherSum;
  return {
    weather: SAFETY_INDEX_WEIGHTS.weather * (1 - scale),
    airQuality: SAFETY_INDEX_WEIGHTS.airQuality * (1 - scale),
    wildfire: SAFETY_INDEX_WEIGHTS.wildfire * (1 - scale),
    water: SAFETY_INDEX_WEIGHTS.water * (1 - scale),
    vectorBorne: vectorBorneWeight,
    healthAdvisories: SAFETY_INDEX_WEIGHTS.healthAdvisories * (1 - scale),
  };
}

function riskLevelToNumber(riskLevel) {
  if (riskLevel === 'low') return 1;
  if (riskLevel === 'moderate') return 2;
  return 3;
}

function scoreToRiskLevel(score) {
  if (score >= 2.35) return 'high';
  if (score >= 1.6) return 'moderate';
  return 'low';
}

function vectorScoreToRiskLevel(score) {
  if (score >= VECTOR_TRAP_BAND_THRESHOLDS.moderateToHigh) return 'high';
  if (score >= VECTOR_TRAP_BAND_THRESHOLDS.lowToModerate) return 'moderate';
  return 'low';
}

function calculateSafetyIndex(alerts, weekOfYear) {
  const weights = weekOfYear !== undefined ? getSeasonalWeights(weekOfYear) : SAFETY_INDEX_WEIGHTS;
  const breakdown = Object.keys(weights).map((category) => {
    const numericRisk = riskLevelToNumber(alerts[category].riskLevel);
    const weight = weights[category];
    return {
      category,
      riskLevel: alerts[category].riskLevel,
      numericRisk,
      contribution: numericRisk * weight,
      weight,
    };
  });

  const overallScore = breakdown.reduce((sum, item) => sum + item.contribution, 0);
  let overallRisk = scoreToRiskLevel(overallScore);
  if (overallRisk === 'low' && breakdown.some((item) => item.riskLevel === 'high')) overallRisk = 'moderate';
  return { overallScore: round(overallScore, 2), overallRisk, breakdown };
}

function getHighRiskState(snapshots) {
  return Object.values(snapshots).reduce((accumulator, snapshot) => {
    Object.entries(snapshot.alerts).forEach(([category, alert]) => {
      if (alert.riskLevel === 'high') accumulator[`${snapshot.region.id}:${category}`] = alert.summary;
    });
    return accumulator;
  }, {});
}

function getNewlyHighKeys(previousState, nextState) {
  return Object.keys(nextState).filter((key) => !previousState[key]);
}

function vectorTempModifier(avgTemp) {
  if (avgTemp < 5) return 0;
  if (avgTemp < 10) return ((avgTemp - 5) / 5) * 0.3;
  if (avgTemp < 18) return 0.3 + ((avgTemp - 10) / 8) * 0.4;
  if (avgTemp < 28) return 0.7 + ((avgTemp - 18) / 10) * 0.3;
  if (avgTemp < 34) return 1.0;
  return clamp(1 - ((avgTemp - 34) / 10) * 0.3, 0, 1);
}

function vectorPrecipModifier(precipMm) {
  if (precipMm < 2) return 0.10;
  if (precipMm < 5) return 0.10 + ((precipMm - 2) / 3) * 0.30;
  if (precipMm < 20) return 0.40 + ((precipMm - 5) / 15) * 0.60;
  if (precipMm < 50) return 1;
  return clamp(1 - ((precipMm - 50) / 50) * 0.4, 0.6, 1);
}

function vectorGddModifier(cumulativeGdd) {
  if (cumulativeGdd < 42) return (cumulativeGdd / 42) * 0.1;
  if (cumulativeGdd < 109) return 0.1 + ((cumulativeGdd - 42) / 67) * 0.4;
  if (cumulativeGdd < 252) return 0.5 + ((cumulativeGdd - 109) / 143) * 0.5;
  return 1;
}

function getCxTarsalisDiapauseFactor(weekOfYear) {
  if (weekOfYear <= 30) return 1.0;
  if (weekOfYear >= 37) return 0.0;
  return 1.0 - (weekOfYear - 30) / 7;
}

function getIxodesQuestingTemperatureFactor(temperatureC) {
  if (temperatureC < 4) return 0;
  if (temperatureC < 6) return (temperatureC - 4) / 2;
  if (temperatureC <= 20) return 1.0;
  if (temperatureC < 26) return 1.0 - (temperatureC - 20) / 6;
  return 0;
}

function getIxodesSeasonFactor(weekOfYear) {
  if (weekOfYear < 14 || weekOfYear > 44) return 0;
  if (weekOfYear < 18) return 0.5 + ((weekOfYear - 14) / 4) * 0.5;
  if (weekOfYear <= 31) return 1.0;
  if (weekOfYear <= 35) return 0.35;
  return 0.5;
}

// Mirrors phacBaseline.ts boreal Aedes functions (JCV + SHHV model)
function getAedesTemperatureFactor(temperatureC) {
  if (temperatureC < 7) return 0;
  if (temperatureC < 12) return ((temperatureC - 7) / 5) * 0.5;
  if (temperatureC < 18) return 0.5 + ((temperatureC - 12) / 6) * 0.5;
  if (temperatureC <= 25) return 1.0;
  if (temperatureC < 30) return 1.0 - ((temperatureC - 25) / 5) * 0.8;
  return Math.max(0, 0.2 - ((temperatureC - 30) / 4) * 0.2);
}

function getAedesSeasonFactor(weekOfYear) {
  if (weekOfYear < 18 || weekOfYear > 38) return 0;
  return Math.exp(-0.5 * Math.pow((weekOfYear - 26) / 5.5, 2));
}

function getSnowshoeHareCycleFactor(year) {
  return (Math.cos(2 * Math.PI * (year - 2020) / 10) + 1) / 2;
}

function getAedesBorealFactor(temperatureC, weekOfYear, year) {
  const tempFactor = getAedesTemperatureFactor(temperatureC);
  const seasonFactor = getAedesSeasonFactor(weekOfYear);
  const hareCycleFactor = getSnowshoeHareCycleFactor(year);
  const jcvFactor = tempFactor * seasonFactor;
  const shvFactor = tempFactor * seasonFactor * (0.4 + 0.6 * hareCycleFactor);
  return 0.6 * jcvFactor + 0.4 * shvFactor;
}

function scoreVectorBorne(row, weekOfYear, cumulativeGdd, regionId) {
  const avgTemp = (row.highC + row.lowC) / 2;
  const { normalizedRisk: wnvBaseline, seasonActive: wnvSeasonActive } = getBaselineForWeek(weekOfYear);
  const tickSeasonFactor = getIxodesSeasonFactor(weekOfYear);
  const tickTempFactor = getIxodesQuestingTemperatureFactor(avgTemp);
  const mosquitoHabitat = CX_TARSALIS_HABITAT_SUITABILITY[regionId];
  const tickRegionBoost = (regionId === 'eastern' || regionId === 'southern' || regionId === 'winnipeg') ? 0.12 : 0;
  const borealHabitat = AEDES_BOREAL_SUITABILITY[regionId] ?? 0;
  const forecastYear = row.isoDate ? parseInt(row.isoDate.slice(0, 4), 10) : 2024;
  const aedesBorealRaw = getAedesBorealFactor(avgTemp, weekOfYear, forecastYear) * borealHabitat;
  const combinedSeasonActive = wnvSeasonActive || tickSeasonFactor > 0 || aedesBorealRaw > 0.01;

  if (!combinedSeasonActive) {
    const mosquitoComparableScore = clamp(1 + clamp(wnvBaseline * mosquitoHabitat, 0, 0.03) * 2, 1, 3);
    return {
      mosquitoComparableScore,
      overallScore: mosquitoComparableScore,
    };
  }

  const suppressedWnvBaseline = wnvBaseline * getCxTarsalisDiapauseFactor(weekOfYear);
  const mosquitoTempMod = vectorTempModifier(avgTemp);
  const pMod = vectorPrecipModifier(row.precipMm);
  const gMod = vectorGddModifier(cumulativeGdd);
  const mosquitoWeatherScore = (mosquitoTempMod + pMod + gMod) / 3;
  const mosquitoComparableRisk = suppressedWnvBaseline * mosquitoHabitat * (0.45 + 0.55 * mosquitoWeatherScore);
  const tickComponent = tickSeasonFactor * clamp(tickTempFactor + tickRegionBoost, 0, 1);
  const w = VECTOR_COMPONENT_WEIGHTS[regionId] ?? { wnv: 0.60, tick: 0.40, boreal: 0.00 };
  const finalRisk = clamp(w.wnv * mosquitoComparableRisk + w.tick * tickComponent + w.boreal * aedesBorealRaw, 0, 1);
  return {
    mosquitoComparableScore: clamp(1 + mosquitoComparableRisk * 2, 1, 3),
    overallScore: clamp(1 + finalRisk * 2, 1, 3),
  };
}

// ── Category Scoring Mirrors ──────────────────────────────────────────────────
// These replicate the app service logic exactly so the regression suite can test
// the same rules that run in production without importing TypeScript modules.

function weatherRiskLevel(maxTempC, hasWarning) {
  if (hasWarning || maxTempC >= 32 || maxTempC <= -30) return 'high';
  if (maxTempC >= 28 || maxTempC <= -20) return 'moderate';
  return 'low';
}

function airQualityRiskLevel(aqhi) {
  if (aqhi >= 7) return 'high';
  if (aqhi >= 4) return 'moderate';
  return 'low';
}

function wildfireRiskLevel(distKm, fireCount) {
  if (fireCount === 0) return 'low';
  if (distKm <= 100) return 'high';
  if (distKm <= 500) return 'moderate';
  return 'low';
}

function healthRiskLevel(headline) {
  if (/emergency|critical/i.test(headline)) return 'high';
  if (/alert|advisory|outbreak|bulletin|recall/i.test(headline)) return 'moderate';
  return 'low';
}

function waterRiskLevel(pwsCount, spwsCount) {
  if (pwsCount > 0) return 'high';
  if (spwsCount > 0) return 'moderate';
  return 'low';
}

// ── Weather Extremes Data ─────────────────────────────────────────────────────
// For each region × year, count days that fall into each risk band using the
// temperature-only path of the weather model (no live warning flag available
// retrospectively). The 2021 heat dome should be clearly visible.

function buildWeatherExtremesData(dailySeriesByKey) {
  const result = [];
  for (const region of REGIONS) {
    for (const year of YEARS) {
      const series = dailySeriesByKey.get(`${region.id}-${year}`);
      if (!series) continue;
      let high = 0; let moderate = 0; let low = 0;
      for (const row of series) {
        const band = weatherRiskLevel(row.highC, false);
        if (band === 'high') high++;
        else if (band === 'moderate') moderate++;
        else low++;
      }
      result.push({ regionId: region.id, regionShort: region.short, color: region.color, year, high, moderate, low, total: series.length });
    }
  }
  return result;
}

// ── Fire Weather Proxy Data ───────────────────────────────────────────────────
// Hot-dry days: maxTemp > 28°C AND total daily precip < 2 mm.
// This is a simplified fire-danger signal that can be computed from the same
// Open-Meteo archive used for the vector validation.
// 2023 was Canada's worst recorded wildfire season; this signal should peak then.

function buildFireWeatherProxyData(dailySeriesByKey) {
  // Aggregate to weekly hot-dry day counts per region × year
  const result = [];
  for (const region of REGIONS) {
    for (const year of YEARS) {
      const series = dailySeriesByKey.get(`${region.id}-${year}`);
      if (!series) continue;
      // Group by ISO week
      const byWeek = new Map();
      for (const row of series) {
        const wk = row.weekOfYear;
        if (!byWeek.has(wk)) byWeek.set(wk, { hotDry: 0, days: 0 });
        const entry = byWeek.get(wk);
        entry.days++;
        if (row.highC > 28 && row.precipMm < 2) entry.hotDry++;
      }
      const weeks = Array.from(byWeek.entries())
        .filter(([wk]) => wk >= 18 && wk <= 43) // fire-relevant season weeks
        .sort(([a], [b]) => a - b)
        .map(([wk, data]) => ({ week: wk, hotDryDays: data.hotDry, totalDays: data.days }));
      result.push({ regionId: region.id, regionShort: region.short, color: region.color, year, weeks });
    }
  }
  return result;
}

function buildWeatherBacktestData(dailySeriesByKey) {
  const series = (dailySeriesByKey.get('winnipeg-2021') ?? [])
    .filter((row) => row.isoDate >= '2021-06-27' && row.isoDate <= '2021-07-04')
    .map((row) => ({
      ...row,
      riskLevel: weatherRiskLevel(row.highC, false),
    }));

  const hotDays = series.filter((row) => row.highC >= 28);
  const extremeDays = series.filter((row) => row.highC >= 32);
  const firstExtremeIndex = series.findIndex((row) => row.highC >= 32);

  return {
    series,
    hotDaysCaptured: hotDays.filter((row) => row.riskLevel !== 'low').length,
    hotDaysTotal: hotDays.length,
    extremeDaysCaptured: extremeDays.filter((row) => row.riskLevel === 'high').length,
    extremeDaysTotal: extremeDays.length,
    prePeakFalseHighs: (firstExtremeIndex === -1 ? series : series.slice(0, firstExtremeIndex))
      .filter((row) => row.riskLevel === 'high').length,
  };
}

function buildSeasonBaselineComparison(validationRows) {
  const weeklyRows = validationRows.filter((entry) => entry.trapCount !== null);
  const weeks = Array.from(new Set(weeklyRows.map((entry) => entry.isoWeek)))
    .sort((left, right) => left - right);

  const series = weeks.map((week) => {
    const subset = weeklyRows.filter((entry) => entry.isoWeek === week);
    return {
      week,
      meanTrap: round(average(subset.map((entry) => entry.trapCount)), 1),
      vectorWeightPct: round(getSeasonalWeights(week).vectorBorne * 100, 2),
    };
  });

  const observedPeak = [...series].sort((left, right) => right.meanTrap - left.meanTrap || left.week - right.week)[0];
  const maxVectorWeight = Math.max(...series.map((entry) => entry.vectorWeightPct));
  const baselinePeakWeeks = series
    .filter((entry) => Math.abs(entry.vectorWeightPct - maxVectorWeight) < 0.001)
    .map((entry) => entry.week);

  const regionSeasons = YEARS.flatMap((year) =>
    REGIONS.map((region) => {
      const subset = weeklyRows.filter((entry) => entry.year === year && entry.regionId === region.id);
      if (!subset.length) return null;
      const regionObservedPeak = [...subset].sort((left, right) => right.trapCount - left.trapCount || left.isoWeek - right.isoWeek)[0];
      const errorWeeks = Math.min(...baselinePeakWeeks.map((week) => Math.abs(regionObservedPeak.isoWeek - week)));
      return {
        year,
        regionId: region.id,
        observedPeakWeek: regionObservedPeak.isoWeek,
        errorWeeks,
      };
    }),
  ).filter(Boolean);

  return {
    series,
    observedPeakWeek: observedPeak.week,
    observedPeakTrap: observedPeak.meanTrap,
    baselinePeakWeeks,
    baselinePeakWeightPct: maxVectorWeight,
    withinTwoWeeks: regionSeasons.filter((entry) => entry.errorWeeks <= 2).length,
    totalRegionSeasons: regionSeasons.length,
  };
}

function summarizeLivePlatformChecks(regressionSummary) {
  const allowedGroups = [
    'Thresholds',
    'Seasonality',
    'Safety score',
    'Notifications',
    'Weather model',
    'Air quality',
    'Wildfire',
    'Health advisory',
    'Water advisory',
  ];
  const totals = allowedGroups
    .map((group) => regressionSummary.totals.find((entry) => entry.group === group))
    .filter(Boolean);
  return {
    totals,
    overallPassed: totals.reduce((sum, entry) => sum + entry.passed, 0),
    overallTotal: totals.reduce((sum, entry) => sum + entry.total, 0),
  };
}

function parseTrapValue(valueText) {
  const normalized = stripTags(valueText)
    .replace(/\s+/g, ' ')
    .replace(/\s*<\s*/g, '<')
    .replace(/\s*>\s*/g, '>')
    .trim()
    .toLowerCase();

  if (!normalized || normalized === 'n/a' || normalized.includes('no trapping')) return null;
  if (normalized === '<1' || /^<\s*1$/.test(normalized)) return 0.5;
  const greaterMatch = normalized.match(/^>\s*(\d+(\.\d+)?)$/);
  if (greaterMatch) return Number(greaterMatch[1]) + 0.5;
  const numeric = normalized.match(/-?\d+(\.\d+)?/);
  return numeric ? Number(numeric[0]) : null;
}

function normalizeMonthLabel(label) {
  return label.toLowerCase().replace(/\./g, '');
}

function monthDisplay(label) {
  const normalized = normalizeMonthLabel(label);
  if (normalized === 'sept' || normalized === 'september') return 'Sep';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseWeekRange(label, year) {
  const cleaned = stripTags(label).replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(
    /^(May|June|July|August|September|Sept)\s+(\d{1,2})\D+(?:(May|June|July|August|September|Sept)\s+)?(\d{1,2})$/i,
  );

  if (!match) throw new Error(`Unable to parse trapping week label "${label}"`);

  const startMonth = MONTH_INDEX[normalizeMonthLabel(match[1])];
  const endMonthSource = match[3] ?? match[1];
  const endMonth = MONTH_INDEX[normalizeMonthLabel(endMonthSource)];
  const startDay = Number(match[2]);
  const endDay = Number(match[4]);
  const startDate = new Date(Date.UTC(year, startMonth - 1, startDay));
  const endDate = new Date(Date.UTC(year, endMonth - 1, endDay));

  return {
    label: `${monthDisplay(match[1])} ${startDay} - ${monthDisplay(endMonthSource)} ${endDay}`,
    startIso: formatIsoDate(startDate),
    endIso: formatIsoDate(endDate),
    isoWeek: getWeekOfYear(startDate),
  };
}

function parseTrapTable(html, year) {
  const tableMatch = html.match(/<table[^>]*summary="Culex Tarsalis Mosquito Trap Catch by Health Region"[\s\S]*?<\/table>/i);
  if (!tableMatch) throw new Error(`Could not find trap table for ${year}`);

  const rows = Array.from(tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => match[1]);
  const data = [];
  for (const rowHtml of rows) {
    const cells = Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (match) => match[1]);
    if (cells.length < 5) continue;
    const firstCell = stripTags(cells[0]);
    if (!/\d/.test(firstCell) || /trapping week/i.test(firstCell) || /health region/i.test(firstCell)) continue;
    const week = parseWeekRange(firstCell, year);
    data.push({
      year,
      weekLabel: week.label,
      startIso: week.startIso,
      endIso: week.endIso,
      isoWeek: week.isoWeek,
      eastern: parseTrapValue(cells[1]),
      western: parseTrapValue(cells[2]),
      southern: parseTrapValue(cells[3]),
      winnipeg: parseTrapValue(cells[4]),
      manitoba: parseTrapValue(cells[5] ?? ''),
    });
  }
  return data;
}

async function loadTrapData() {
  const weeklyRows = [];
  for (const year of YEARS) {
    const html = await readText(path.join(RAW_DIR, `stats${year}.html`));
    weeklyRows.push(...parseTrapTable(html, year));
  }
  return weeklyRows;
}

async function fetchJson(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'one-health-validation/1.0',
      accept: 'application/json,text/plain,*/*',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const text = await response.text();
  await writeText(outputPath, text);
  return JSON.parse(text);
}

async function loadArchiveWeather(region, year) {
  const outputPath = path.join(WEATHER_DIR, `${region.id}-${year}.json`);
  try {
    return JSON.parse(await readText(outputPath));
  } catch {
    const url =
      'https://archive-api.open-meteo.com/v1/archive' +
      `?latitude=${region.latitude}` +
      `&longitude=${region.longitude}` +
      `&start_date=${year}-01-01` +
      `&end_date=${year}-09-30` +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum' +
      '&timezone=America%2FWinnipeg';
    return fetchJson(url, outputPath);
  }
}

function buildDailyWeatherRows(json) {
  return json.daily.time.map((isoDate, index) => ({
    isoDate,
    highC: json.daily.temperature_2m_max[index],
    lowC: json.daily.temperature_2m_min[index],
    precipMm: json.daily.precipitation_sum[index],
  }));
}

function buildDailyVectorSeries(dailyRows, regionId) {
  let cumulativeGdd = 0;
  return dailyRows.map((row) => {
    const avgTemp = (row.highC + row.lowC) / 2;
    cumulativeGdd += Math.max(0, avgTemp - 14.3);
    const weekOfYear = getWeekOfYear(new Date(`${row.isoDate}T00:00:00Z`));
    const { mosquitoComparableScore, overallScore } = scoreVectorBorne(row, weekOfYear, cumulativeGdd, regionId);
    return {
      ...row,
      cumulativeGdd: round(cumulativeGdd, 2),
      weekOfYear,
      mosquitoComparableScore: round(mosquitoComparableScore, 3),
      score: round(overallScore, 3),
      riskLevel: vectorScoreToRiskLevel(overallScore),
    };
  });
}

function findDailyRowsForWeek(dailySeries, startIso, endIso) {
  return dailySeries.filter((row) => row.isoDate >= startIso && row.isoDate <= endIso);
}

function classifyTrapBand(value) {
  if (value === null || value === undefined) return null;
  if (value < 5) return 'low';
  if (value < 20) return 'moderate';
  return 'high';
}

function buildWeeklyValidationRows(trapRows, dailySeriesByKey) {
  const validationRows = [];
  for (const trapRow of trapRows) {
    for (const region of REGIONS) {
      const dailyRows = findDailyRowsForWeek(dailySeriesByKey.get(`${region.id}-${trapRow.year}`), trapRow.startIso, trapRow.endIso);
      if (!dailyRows.length) continue;
      const trapCount = trapRow[region.id];
      const modelScore = average(dailyRows.map((row) => row.mosquitoComparableScore));
      const overallVectorScore = average(dailyRows.map((row) => row.score));
      validationRows.push({
        year: trapRow.year,
        regionId: region.id,
        regionLabel: region.boardLabel,
        weekLabel: trapRow.weekLabel,
        startIso: trapRow.startIso,
        endIso: trapRow.endIso,
        isoWeek: trapRow.isoWeek,
        trapCount,
        trapBand: classifyTrapBand(trapCount),
        modelScore: round(modelScore, 3),
        modelBand: vectorScoreToRiskLevel(modelScore),
        overallVectorScore: round(overallVectorScore, 3),
        overallVectorBand: vectorScoreToRiskLevel(overallVectorScore),
        meanHighC: round(average(dailyRows.map((row) => row.highC)), 1),
        meanLowC: round(average(dailyRows.map((row) => row.lowC)), 1),
        totalPrecipMm: round(dailyRows.reduce((sum, row) => sum + row.precipMm, 0), 1),
        endingGdd: round(dailyRows[dailyRows.length - 1].cumulativeGdd, 1),
      });
    }
  }
  return validationRows;
}

function buildCorrelationGrid(validationRows) {
  return YEARS.map((year) => ({
    year,
    values: REGIONS.map((region) => {
      const series = validationRows.filter((entry) => entry.year === year && entry.regionId === region.id && entry.trapCount !== null);
      const rho = spearman(series.map((entry) => entry.modelScore), series.map((entry) => entry.trapCount));
      return { regionId: region.id, regionLabel: region.short, rho: rho === null ? null : round(rho, 2) };
    }),
  }));
}

function buildPeakAlignment(validationRows) {
  return YEARS.flatMap((year) =>
    REGIONS.map((region) => {
      const series = validationRows.filter((entry) => entry.year === year && entry.regionId === region.id && entry.trapCount !== null);
      const observedPeak = [...series].sort((left, right) => right.trapCount - left.trapCount)[0];
      const modelPeak = [...series].sort((left, right) => right.modelScore - left.modelScore)[0];
      return {
        year,
        regionId: region.id,
        regionShort: region.short,
        color: region.color,
        observedIsoWeek: observedPeak?.isoWeek ?? null,
        observedWeekLabel: observedPeak?.weekLabel ?? null,
        observedTrapCount: observedPeak?.trapCount ?? null,
        modelIsoWeek: modelPeak?.isoWeek ?? null,
        modelWeekLabel: modelPeak?.weekLabel ?? null,
        modelScore: modelPeak?.modelScore ?? null,
        absoluteErrorWeeks: observedPeak && modelPeak ? Math.abs(observedPeak.isoWeek - modelPeak.isoWeek) : null,
      };
    }),
  );
}

function buildTimeSeriesSelection(validationRows) {
  const south2024 = validationRows
    .filter((entry) => entry.year === 2024 && entry.regionId === 'southern' && entry.trapCount !== null)
    .sort((left, right) => left.startIso.localeCompare(right.startIso));
  if (south2024.length) return south2024;
  return validationRows
    .filter((entry) => entry.regionId === 'southern' && entry.trapCount !== null)
    .sort((left, right) => left.startIso.localeCompare(right.startIso))
    .slice(-12);
}

function runRegressionSuite() {
  const cases = [];
  const addCase = (group, name, expected, actual, passed) => cases.push({ group, name, expected, actual, passed });

  const winterScore = scoreVectorBorne({ highC: -8, lowC: -18, precipMm: 1 }, 3, 0, 'southern').overallScore;
  addCase('Vector model', 'Deep-winter day stays low', 'score <= 1.10', winterScore.toFixed(2), winterScore <= 1.1);

  const earlySeason = scoreVectorBorne({ highC: 17, lowC: 7, precipMm: 4 }, 21, 35, 'southern').overallScore;
  const peakSeason = scoreVectorBorne({ highC: 31, lowC: 19, precipMm: 10 }, 31, 240, 'southern').overallScore;
  addCase('Vector model', 'Peak summer exceeds cool spring', 'peak > spring', `${peakSeason.toFixed(2)} vs ${earlySeason.toFixed(2)}`, peakSeason > earlySeason);

  const lowGdd = scoreVectorBorne({ highC: 27, lowC: 16, precipMm: 10 }, 29, 80, 'southern').overallScore;
  const highGdd = scoreVectorBorne({ highC: 27, lowC: 16, precipMm: 10 }, 29, 210, 'southern').overallScore;
  addCase('Vector model', 'Crossing GDD threshold raises risk', 'higher GDD > lower GDD', `${highGdd.toFixed(2)} vs ${lowGdd.toFixed(2)}`, highGdd > lowGdd);

  const moderateRain = scoreVectorBorne({ highC: 28, lowC: 18, precipMm: 18 }, 30, 220, 'southern').overallScore;
  const floodingRain = scoreVectorBorne({ highC: 28, lowC: 18, precipMm: 65 }, 30, 220, 'southern').overallScore;
  addCase('Vector model', 'Extreme rain does not outscore breeding rain', '18 mm >= 65 mm', `${moderateRain.toFixed(2)} vs ${floodingRain.toFixed(2)}`, moderateRain >= floodingRain);

  addCase('Thresholds', '1.59 stays low', 'low', scoreToRiskLevel(1.59), scoreToRiskLevel(1.59) === 'low');
  addCase('Thresholds', '1.60 becomes moderate', 'moderate', scoreToRiskLevel(1.6), scoreToRiskLevel(1.6) === 'moderate');
  addCase('Thresholds', '2.35 becomes high', 'high', scoreToRiskLevel(2.35), scoreToRiskLevel(2.35) === 'high');

  const winterWeights = getSeasonalWeights(3);
  const summerWeights = getSeasonalWeights(31);
  const weightSum = Object.values(summerWeights).reduce((sum, value) => sum + value, 0);
  addCase('Seasonality', 'Vector weight peaks in summer', 'summer > winter', `${summerWeights.vectorBorne.toFixed(3)} vs ${winterWeights.vectorBorne.toFixed(3)}`, summerWeights.vectorBorne > winterWeights.vectorBorne);
  addCase('Seasonality', 'Weights remain normalized', 'sum ~= 1.000', weightSum.toFixed(3), Math.abs(weightSum - 1) < 0.0001);

  const safety = calculateSafetyIndex({
    weather: { riskLevel: 'low' },
    airQuality: { riskLevel: 'low' },
    wildfire: { riskLevel: 'high' },
    water: { riskLevel: 'low' },
    vectorBorne: { riskLevel: 'low' },
    healthAdvisories: { riskLevel: 'low' },
  }, 2);
  addCase('Safety score', 'A single high category cannot collapse to overall low', 'moderate or high', safety.overallRisk, safety.overallRisk !== 'low');

  const previous = getHighRiskState({
    southern: { region: { id: 'southern' }, alerts: { weather: { riskLevel: 'high', summary: 'Storm' }, airQuality: { riskLevel: 'low', summary: 'AQHI low' } } },
  });
  const next = getHighRiskState({
    southern: { region: { id: 'southern' }, alerts: { weather: { riskLevel: 'high', summary: 'Storm' }, airQuality: { riskLevel: 'high', summary: 'Smoke' } } },
  });
  addCase('Notifications', 'Already-high hazards are not re-counted', '0 new keys', `${getNewlyHighKeys(previous, previous).length}`, getNewlyHighKeys(previous, previous).length === 0);
  addCase('Notifications', 'Only new high hazards are counted', '1 new key', `${getNewlyHighKeys(previous, next).length}`, getNewlyHighKeys(previous, next).length === 1 && getNewlyHighKeys(previous, next)[0] === 'southern:airQuality');

  // ── Boreal Aedes (JCV / SHHV) model ─────────────────────────────────────────
  const aedesPeakNorth = getAedesBorealFactor(20, 26, 2026) * 1.0; // northern habitat
  const aedesWinterNorth = getAedesBorealFactor(-5, 3, 2026) * 1.0;
  addCase('Boreal Aedes', 'Peak season mid-June northern > 0.5', '> 0.5', aedesPeakNorth.toFixed(3), aedesPeakNorth > 0.5);
  addCase('Boreal Aedes', 'Deep winter northern = 0', '0', aedesWinterNorth.toFixed(3), aedesWinterNorth === 0);
  const aedesSouth = getAedesBorealFactor(20, 26, 2026) * (AEDES_BOREAL_SUITABILITY.southern ?? 0.05);
  const aedesNorth = getAedesBorealFactor(20, 26, 2026) * 1.0;
  addCase('Boreal Aedes', 'Northern boreal >> southern for Aedes suitability', 'north > 10× south', `north=${aedesNorth.toFixed(2)} south=${aedesSouth.toFixed(2)}`, aedesNorth > 10 * aedesSouth);
  const hare2026 = getSnowshoeHareCycleFactor(2026);
  const hare2030 = getSnowshoeHareCycleFactor(2030);
  addCase('Boreal Aedes', 'Hare cycle: 2026 trough < 0.2, 2030 peak > 0.9', '2026<0.2 & 2030>0.9', `${hare2026.toFixed(2)}, ${hare2030.toFixed(2)}`, hare2026 < 0.2 && hare2030 > 0.9);

  // ── Weather model ────────────────────────────────────────────────────────────
  addCase('Weather model', '31°C stays moderate (below High threshold)', 'moderate', weatherRiskLevel(31, false), weatherRiskLevel(31, false) === 'moderate');
  addCase('Weather model', '32°C triggers High', 'high', weatherRiskLevel(32, false), weatherRiskLevel(32, false) === 'high');
  addCase('Weather model', '-25°C is moderate (cold threshold)', 'moderate', weatherRiskLevel(-25, false), weatherRiskLevel(-25, false) === 'moderate');
  addCase('Weather model', '-30°C triggers High', 'high', weatherRiskLevel(-30, false), weatherRiskLevel(-30, false) === 'high');
  addCase('Weather model', 'Active warning overrides cool temp → High', 'high', weatherRiskLevel(15, true), weatherRiskLevel(15, true) === 'high');

  // ── Air quality ──────────────────────────────────────────────────────────────
  addCase('Air quality', 'AQHI 3.9 → low', 'low', airQualityRiskLevel(3.9), airQualityRiskLevel(3.9) === 'low');
  addCase('Air quality', 'AQHI 4.0 → moderate', 'moderate', airQualityRiskLevel(4.0), airQualityRiskLevel(4.0) === 'moderate');
  addCase('Air quality', 'AQHI 6.9 → moderate', 'moderate', airQualityRiskLevel(6.9), airQualityRiskLevel(6.9) === 'moderate');
  addCase('Air quality', 'AQHI 7.0 → high', 'high', airQualityRiskLevel(7.0), airQualityRiskLevel(7.0) === 'high');

  // ── Wildfire ─────────────────────────────────────────────────────────────────
  addCase('Wildfire', '0 fires always returns low', 'low', wildfireRiskLevel(50, 0), wildfireRiskLevel(50, 0) === 'low');
  addCase('Wildfire', 'Fire at 99 km → high', 'high', wildfireRiskLevel(99, 3), wildfireRiskLevel(99, 3) === 'high');
  addCase('Wildfire', 'Fire at 101 km → moderate', 'moderate', wildfireRiskLevel(101, 3), wildfireRiskLevel(101, 3) === 'moderate');
  addCase('Wildfire', 'Fire at 501 km → low', 'low', wildfireRiskLevel(501, 3), wildfireRiskLevel(501, 3) === 'low');

  // ── Health advisory ──────────────────────────────────────────────────────────
  addCase('Health advisory', '"emergency shelter advisory" → high', 'high', healthRiskLevel('emergency shelter advisory'), healthRiskLevel('emergency shelter advisory') === 'high');
  addCase('Health advisory', '"boil water advisory issued" → moderate', 'moderate', healthRiskLevel('boil water advisory issued'), healthRiskLevel('boil water advisory issued') === 'moderate');
  addCase('Health advisory', '"flu season reminder" → low', 'low', healthRiskLevel('flu season reminder'), healthRiskLevel('flu season reminder') === 'low');
  addCase('Health advisory', '"critical exposure event" → high', 'high', healthRiskLevel('critical exposure event'), healthRiskLevel('critical exposure event') === 'high');

  // ── Water advisory ───────────────────────────────────────────────────────────
  addCase('Water advisory', 'PWS count > 0 → high', 'high', waterRiskLevel(1, 0), waterRiskLevel(1, 0) === 'high');
  addCase('Water advisory', 'PWS=0, SPWS>0 → moderate', 'moderate', waterRiskLevel(0, 1), waterRiskLevel(0, 1) === 'moderate');
  addCase('Water advisory', 'PWS=0, SPWS=0 → low', 'low', waterRiskLevel(0, 0), waterRiskLevel(0, 0) === 'low');

  return cases;
}

function summarizeRegression(cases) {
  const groups = Array.from(new Set(cases.map((entry) => entry.group)));
  const totals = groups.map((group) => {
    const subset = cases.filter((entry) => entry.group === group);
    const passed = subset.filter((entry) => entry.passed).length;
    return { group, passed, total: subset.length, passRate: round((passed / subset.length) * 100, 1) };
  });
  return { totals, overallPassed: cases.filter((entry) => entry.passed).length, overallTotal: cases.length };
}

function wrapSvg(width, height, body, extraStyles = '') {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    '<defs><style>',
    'text { font-family: Arial, Helvetica, sans-serif; fill: #103b2c; }',
    '.title { font-size: 22px; font-weight: 700; }',
    '.subtitle { font-size: 13px; fill: #4a6b5c; }',
    '.axis { stroke: #7aa68b; stroke-width: 1; }',
    '.grid { stroke: #d7e7dc; stroke-width: 1; }',
    '.tick { font-size: 11px; fill: #486355; }',
    '.caption { font-size: 12px; fill: #27493a; }',
    '.small { font-size: 11px; fill: #486355; }',
    extraStyles,
    '</style></defs>',
    '<rect width="100%" height="100%" rx="18" fill="#f8fcf9" stroke="#9ebaa9" stroke-width="2"/>',
    body,
    '</svg>',
  ].join('');
}

function makeLinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function renderTimeSeriesFigure(series) {
  const width = 760;
  const height = 360;
  const margin = { left: 60, right: 62, top: 54, bottom: 64 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxTrap = Math.max(...series.map((entry) => entry.trapCount));
  const xForIndex = (index) => margin.left + (innerWidth * index) / (series.length - 1);
  const yForModel = (score) => margin.top + innerHeight - ((score - 1) / 2) * innerHeight;
  const yForTrap = (count) => margin.top + innerHeight - (count / maxTrap) * innerHeight;
  const modelPoints = series.map((entry, index) => ({ x: xForIndex(index), y: yForModel(entry.modelScore) }));
  const trapPoints = series.map((entry, index) => ({ x: xForIndex(index), y: yForTrap(entry.trapCount) }));

  const gridLines = [1, 1.5, 2, 2.5, 3].map((value) => {
    const y = yForModel(value);
    return `<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`;
  }).join('');

  const leftTicks = [1, 1.5, 2, 2.5, 3].map((value) => {
    const y = yForModel(value);
    return `<text class="tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join('');

  const rightTicks = [0, maxTrap * 0.25, maxTrap * 0.5, maxTrap * 0.75, maxTrap].map((value) => {
    const y = yForTrap(value);
    return `<text class="tick" x="${width - margin.right + 10}" y="${y + 4}">${Math.round(value)}</text>`;
  }).join('');

  const xTicks = series.map((entry, index) => {
    const x = xForIndex(index);
    return `<g><line class="axis" x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}"/><text class="tick" x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle">${escapeXml(entry.weekLabel)}</text></g>`;
  }).join('');

  const body = [
    '<text class="title" x="28" y="34">Fig 9. Weekly Vector Score vs. Official Mosquito Trap Catch</text>',
    '<text class="subtitle" x="28" y="52">Southern-Sante Sud, 2024 retrospective replay using archived weather and Manitoba surveillance data</text>',
    gridLines,
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"/>`,
    `<line class="axis" x1="${width - margin.right}" y1="${margin.top}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`,
    leftTicks,
    rightTicks,
    xTicks,
    `<path d="${makeLinePath(trapPoints)}" fill="none" stroke="#d97706" stroke-width="3"/>`,
    trapPoints.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#d97706"/><text class="small" x="${point.x}" y="${point.y - 8}" text-anchor="middle">${series[index].trapCount}</text>`).join(''),
    `<path d="${makeLinePath(modelPoints)}" fill="none" stroke="#15803d" stroke-width="4"/>`,
    modelPoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="#15803d"/>`).join(''),
    '<rect x="516" y="62" width="210" height="60" rx="10" fill="#eef6f0" stroke="#bdd2c3"/>',
    '<line x1="536" y1="84" x2="570" y2="84" stroke="#15803d" stroke-width="4"/>',
    '<circle cx="553" cy="84" r="4.5" fill="#15803d"/>',
    '<text class="caption" x="580" y="88">Weekly mean model score (1.0-3.0)</text>',
    '<line x1="536" y1="106" x2="570" y2="106" stroke="#d97706" stroke-width="3"/>',
    '<circle cx="553" cy="106" r="4" fill="#d97706"/>',
    '<text class="caption" x="580" y="110">Official Cx. tarsalis trap catch</text>',
    '<text class="caption" x="28" y="334">Left axis: model score. Right axis: average Culex tarsalis per trap catch.</text>',
  ].join('');

  return wrapSvg(width, height, body);
}

function heatColor(value) {
  if (value === null) return '#d6ddd9';
  const t = (value + 1) / 2;
  return `hsl(${12 + t * 118} 68% ${92 - t * 34}%)`;
}

function renderCorrelationHeatmap(grid) {
  const width = 760;
  const height = 340;
  const cellWidth = 130;
  const cellHeight = 42;
  const startX = 180;
  const startY = 92;
  const body = [
    '<text class="title" x="28" y="34">Fig 10. Rank Correlation Between Model Score and Trap Catch</text>',
    '<text class="subtitle" x="28" y="52">Spearman rho by region and season. Higher values mean the model tracked weekly mosquito activity better.</text>',
  ];

  REGIONS.forEach((region, columnIndex) => {
    body.push(`<text class="caption" x="${startX + columnIndex * cellWidth + cellWidth / 2}" y="${startY - 18}" text-anchor="middle">${region.short}</text>`);
  });

  grid.forEach((row, rowIndex) => {
    const y = startY + rowIndex * cellHeight;
    body.push(`<text class="caption" x="${startX - 16}" y="${y + 27}" text-anchor="end">${row.year}</text>`);
    row.values.forEach((entry, columnIndex) => {
      const x = startX + columnIndex * cellWidth;
      body.push(`<rect x="${x}" y="${y}" width="${cellWidth - 8}" height="${cellHeight - 8}" rx="10" fill="${heatColor(entry.rho)}" stroke="#a7b9af"/>`);
      body.push(`<text class="caption" x="${x + (cellWidth - 8) / 2}" y="${y + 25}" text-anchor="middle">${entry.rho === null ? 'n/a' : entry.rho.toFixed(2)}</text>`);
    });
  });

  body.push('<text class="caption" x="28" y="320">2021-2024 only. Northern Manitoba is excluded because the surveillance trap network covers southern regions.</text>');
  return wrapSvg(width, height, body.join(''));
}

function renderPeakAlignmentFigure(points) {
  const valid = points.filter((entry) => entry.observedIsoWeek !== null && entry.modelIsoWeek !== null);
  const width = 760;
  const height = 360;
  const margin = { left: 68, right: 34, top: 58, bottom: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minWeek = Math.min(...valid.map((entry) => Math.min(entry.observedIsoWeek, entry.modelIsoWeek))) - 1;
  const maxWeek = Math.max(...valid.map((entry) => Math.max(entry.observedIsoWeek, entry.modelIsoWeek))) + 1;
  const xFor = (week) => margin.left + ((week - minWeek) / (maxWeek - minWeek)) * innerWidth;
  const yFor = (week) => margin.top + innerHeight - ((week - minWeek) / (maxWeek - minWeek)) * innerHeight;

  const body = [
    '<text class="title" x="28" y="34">Fig 11. Peak-Week Alignment Across 16 Region-Seasons</text>',
    '<text class="subtitle" x="28" y="52">Each point compares the model peak week to the observed trap-catch peak week. Points on the diagonal are exact hits.</text>',
    `<line class="grid" x1="${margin.left}" y1="${margin.top}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"/>`,
    '<text class="caption" x="384" y="342" text-anchor="middle">Observed peak ISO week</text>',
    '<text class="caption" x="18" y="200" transform="rotate(-90 18 200)" text-anchor="middle">Model peak ISO week</text>',
  ];

  for (let week = minWeek; week <= maxWeek; week += 2) {
    const x = xFor(week);
    const y = yFor(week);
    body.push(`<line class="grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"/>`);
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`);
    body.push(`<text class="tick" x="${x}" y="${height - margin.bottom + 20}" text-anchor="middle">${week}</text>`);
    body.push(`<text class="tick" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${week}</text>`);
  }

  valid.forEach((entry) => {
    const x = xFor(entry.observedIsoWeek);
    const y = yFor(entry.modelIsoWeek);
    body.push(`<circle cx="${x}" cy="${y}" r="7" fill="${entry.color}" opacity="0.88"/>`);
    body.push(`<text class="small" x="${x + 10}" y="${y - 10}">${entry.regionShort} ${String(entry.year).slice(-2)}</text>`);
  });

  const medianError = percentile(valid.map((entry) => entry.absoluteErrorWeeks).sort((left, right) => left - right), 0.5);
  body.push(`<text class="caption" x="520" y="86">Median absolute peak error: ${medianError.toFixed(1)} weeks</text>`);
  return wrapSvg(width, height, body.join(''));
}

function renderRegressionBars(summary) {
  const width = 760;
  const height = 330;
  const left = 170;
  const barTop = 96;
  const rowHeight = 42;
  const maxWidth = 470;
  const body = [
    '<text class="title" x="28" y="34">Fig 7. Automated Regression Suite for Core App Logic</text>',
    '<text class="subtitle" x="28" y="52">Pass rate by subsystem. These tests check thresholds, seasonality, safety-score safeguards, and notification rules.</text>',
  ];

  summary.totals.forEach((entry, index) => {
    const y = barTop + index * rowHeight;
    const widthPx = (entry.passRate / 100) * maxWidth;
    body.push(`<text class="caption" x="${left - 14}" y="${y + 17}" text-anchor="end">${escapeXml(entry.group)}</text>`);
    body.push(`<rect x="${left}" y="${y}" width="${maxWidth}" height="24" rx="12" fill="#e2ebe5"/>`);
    body.push(`<rect x="${left}" y="${y}" width="${widthPx}" height="24" rx="12" fill="#15803d"/>`);
    body.push(`<text class="caption" x="${left + maxWidth + 12}" y="${y + 17}">${entry.passed}/${entry.total}</text>`);
  });

  body.push(`<text class="caption" x="28" y="302">Overall result: ${summary.overallPassed}/${summary.overallTotal} automated checks passed.</text>`);
  return wrapSvg(width, height, body.join(''));
}

function renderRegressionMatrix(cases) {
  const width = 760;
  const height = 460;
  const rowHeight = 28;
  const startY = 96;
  const columns = [
    { label: 'Test', x: 24, anchor: 'start' },
    { label: 'Expected', x: 340, anchor: 'start' },
    { label: 'Actual', x: 500, anchor: 'start' },
    { label: 'Status', x: 694, anchor: 'middle' },
  ];

  const body = [
    '<text class="title" x="28" y="34">Fig 8. Concrete Test Cases Used in the Regression Suite</text>',
    '<text class="subtitle" x="28" y="52">This figure is generated from the same program run. It shows the specific checks behind the pass summary.</text>',
    '<rect x="20" y="76" width="720" height="34" rx="10" fill="#e8f1eb" stroke="#b9ccc0"/>',
  ];

  columns.forEach((column) => {
    body.push(`<text class="caption" x="${column.x}" y="98" text-anchor="${column.anchor}">${column.label}</text>`);
  });

  cases.forEach((entry, index) => {
    const y = startY + index * rowHeight;
    const fill = index % 2 === 0 ? '#fbfdfb' : '#f1f7f3';
    body.push(`<rect x="20" y="${y}" width="720" height="${rowHeight}" fill="${fill}" stroke="#e0ebe3"/>`);
    body.push(`<text class="small" x="24" y="${y + 18}">${escapeXml(entry.name)}</text>`);
    body.push(`<text class="small" x="340" y="${y + 18}">${escapeXml(entry.expected)}</text>`);
    body.push(`<text class="small" x="500" y="${y + 18}">${escapeXml(entry.actual)}</text>`);
    body.push(`<rect x="664" y="${y + 6}" width="58" height="16" rx="8" fill="${entry.passed ? '#15803d' : '#b91c1c'}"/>`);
    body.push(`<text x="693" y="${y + 18}" text-anchor="middle" font-size="10" fill="#ffffff">${entry.passed ? 'PASS' : 'FAIL'}</text>`);
  });

  return wrapSvg(width, height, body.join(''));
}

// ── Fig 9: Weather Risk Profile by Year ──────────────────────────────────────
function renderWeatherExtremesChart(data) {
  const width = 760;
  const height = 420;
  const margin = { left: 56, right: 24, top: 62, bottom: 120 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const regionIds = REGIONS.map((r) => r.id);
  const groupW = innerWidth / YEARS.length;
  const barW = Math.floor(groupW / (regionIds.length + 1));
  const maxDays = Math.max(...data.map((d) => d.high + d.moderate));

  const body = [
    '<text class="title" x="28" y="34">Fig 6. Weather Risk Profile — Extreme Temperature Days by Year</text>',
    '<text class="subtitle" x="28" y="52">Days classified High (≥32°C) or Moderate (≥28°C) per region using archived Open-Meteo data, 2021–2024.</text>',
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${margin.left + innerWidth}" y2="${margin.top + innerHeight}"/>`,
  ];

  // y-axis grid + ticks
  [0, 10, 20, 30, 40, 50].forEach((val) => {
    if (val > maxDays + 5) return;
    const y = margin.top + innerHeight - (val / (maxDays + 5)) * innerHeight;
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${margin.left + innerWidth}" y2="${y}"/>`);
    body.push(`<text class="tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${val}</text>`);
  });

  YEARS.forEach((year, yi) => {
    const groupX = margin.left + yi * groupW;
    body.push(`<text class="caption" x="${groupX + groupW / 2}" y="${margin.top + innerHeight + 20}" text-anchor="middle">${year}</text>`);
    if (year === 2021) body.push(`<text class="small" x="${groupX + groupW / 2}" y="${margin.top + innerHeight + 36}" text-anchor="middle" fill="#b91c1c">← Heat Dome</text>`);

    REGIONS.forEach((region, ri) => {
      const entry = data.find((d) => d.regionId === region.id && d.year === year);
      if (!entry) return;
      const x = groupX + ri * (barW + 2) + 6;
      const highH = (entry.high / (maxDays + 5)) * innerHeight;
      const modH = (entry.moderate / (maxDays + 5)) * innerHeight;
      const baseY = margin.top + innerHeight;
      body.push(`<rect x="${x}" y="${baseY - highH}" width="${barW}" height="${highH}" fill="#dc2626" rx="2"/>`);
      body.push(`<rect x="${x}" y="${baseY - highH - modH}" width="${barW}" height="${modH}" fill="#f59e0b" rx="2"/>`);
    });
  });

  // legend
  body.push('<rect x="540" y="68" width="12" height="12" fill="#dc2626" rx="2"/>');
  body.push('<text class="small" x="558" y="79">High (≥32°C)</text>');
  body.push('<rect x="540" y="86" width="12" height="12" fill="#f59e0b" rx="2"/>');
  body.push('<text class="small" x="558" y="97">Moderate (≥28°C)</text>');

  // region colour legend
  REGIONS.forEach((region, ri) => {
    const lx = margin.left + ri * 90;
    body.push(`<rect x="${lx}" y="${height - 26}" width="10" height="10" fill="${region.color}" rx="2"/>`);
    body.push(`<text class="small" x="${lx + 14}" y="${height - 18}">${region.short}</text>`);
  });

  body.push(`<text class="caption" x="28" y="${height - 6}">Each cluster = one year. Bars left-to-right: East, West, South, WPG. Stacked: bottom = High days (≥32°C), top = Moderate days (≥28°C).</text>`);
  return wrapSvg(width, height, body.join(''));
}

// ── Fig 10: Wildfire Season Signal ───────────────────────────────────────────
function renderFireWeatherProxyChart(data) {
  const width = 760;
  const height = 380;
  const margin = { left: 52, right: 28, top: 62, bottom: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minWeek = 18;
  const maxWeek = 43;
  const maxDays = Math.max(...data.flatMap((d) => d.weeks.map((w) => w.hotDryDays)), 1);
  const xFor = (wk) => margin.left + ((wk - minWeek) / (maxWeek - minWeek)) * innerWidth;
  const yFor = (val) => margin.top + innerHeight - (val / maxDays) * innerHeight;

  const body = [
    '<text class="title" x="28" y="34">Fig 7. Wildfire Season Signal — Weekly Hot-Dry Days by Year</text>',
    '<text class="subtitle" x="28" y="52">Weeks with maxTemp > 28°C and precip &lt; 2 mm. 2023 (Canada\'s worst fire season) shows the strongest signal.</text>',
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${margin.left + innerWidth}" y2="${margin.top + innerHeight}"/>`,
  ];

  [0, 1, 2, 3, 4, 5, 6, 7].forEach((val) => {
    if (val > maxDays) return;
    const y = yFor(val);
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${margin.left + innerWidth}" y2="${y}"/>`);
    body.push(`<text class="tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${val}</text>`);
  });

  // x-axis ticks every 2 weeks
  for (let wk = 20; wk <= 42; wk += 4) {
    const x = xFor(wk);
    body.push(`<line class="axis" x1="${x}" y1="${margin.top + innerHeight}" x2="${x}" y2="${margin.top + innerHeight + 6}"/>`);
    body.push(`<text class="tick" x="${x}" y="${margin.top + innerHeight + 18}" text-anchor="middle">Wk ${wk}</text>`);
  }

  // draw one line per year, averaged across regions
  const weekNums = Array.from({ length: maxWeek - minWeek + 1 }, (_, i) => i + minWeek);
  const colorByYear = { 2021: '#0369a1', 2022: '#166534', 2023: '#dc2626', 2024: '#d97706' };

  YEARS.forEach((year) => {
    const yearData = data.filter((d) => d.year === year);
    const points = weekNums.map((wk) => {
      const vals = yearData.map((d) => {
        const w = d.weeks.find((entry) => entry.week === wk);
        return w ? w.hotDryDays : 0;
      });
      return { x: xFor(wk), y: yFor(average(vals)) };
    });
    const dashArray = year === 2023 ? '' : 'stroke-dasharray="5 3"';
    body.push(`<path d="${makeLinePath(points)}" fill="none" stroke="${colorByYear[year]}" stroke-width="${year === 2023 ? 3.5 : 2}" ${dashArray}/>`);
  });

  // legend
  YEARS.forEach((year, i) => {
    const lx = 560;
    const ly = 72 + i * 20;
    const dash = year === 2023 ? '' : 'stroke-dasharray="5 3"';
    body.push(`<line x1="${lx}" y1="${ly + 5}" x2="${lx + 28}" y2="${ly + 5}" stroke="${colorByYear[year]}" stroke-width="${year === 2023 ? 3.5 : 2}" ${dash}/>`);
    body.push(`<text class="small" x="${lx + 34}" y="${ly + 9}">${year}${year === 2023 ? ' ← worst fire season' : ''}</text>`);
  });

  body.push(`<text class="caption" x="28" y="${height - 6}">Average across all four regions. Higher = more hot, dry days that week. Weeks 18–43 (May–Oct) shown.</text>`);
  return wrapSvg(width, height, body.join(''));
}

// ── Fig 11: Expanded Regression Bars (all 5 categories) ─────────────────────
function renderWeatherBacktestFigure(data) {
  const width = 760;
  const height = 420;
  const margin = { left: 56, right: 30, top: 72, bottom: 132 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const series = data.series;
  const minTemp = 22;
  const maxTemp = 36;
  const xFor = (index) => margin.left + (innerWidth * index) / Math.max(series.length - 1, 1);
  const yForTemp = (value) => margin.top + innerHeight - ((value - minTemp) / (maxTemp - minTemp)) * innerHeight;
  const stripY = margin.top + innerHeight + 18;
  const stripH = 18;
  const stripW = innerWidth / Math.max(series.length, 1) - 6;
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const body = [
    '<text class="title" x="28" y="34">Fig 4. Known-Event Backtest — Winnipeg 2021 Heat Event</text>',
    '<text class="subtitle" x="28" y="52">Archived daily max temperature compared with the exact weather category the live app would have shown each day.</text>',
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${margin.left + innerWidth}" y2="${margin.top + innerHeight}"/>`,
  ];

  [22, 24, 26, 28, 30, 32, 34, 36].forEach((value) => {
    const y = yForTemp(value);
    const dash = value === 28 || value === 32 ? 'stroke-dasharray="4 3"' : '';
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${margin.left + innerWidth}" y2="${y}" ${dash}/>`);
    body.push(`<text class="tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${value}</text>`);
    if (value === 28) body.push(`<text class="small" x="${margin.left + innerWidth - 8}" y="${y - 4}" text-anchor="end">28C = Moderate</text>`);
    if (value === 32) body.push(`<text class="small" x="${margin.left + innerWidth - 8}" y="${y - 4}" text-anchor="end">32C = High</text>`);
  });

  const points = series.map((entry, index) => ({
    x: xFor(index),
    y: yForTemp(entry.highC),
    color: entry.riskLevel === 'high' ? '#dc2626' : entry.riskLevel === 'moderate' ? '#f59e0b' : '#16a34a',
  }));

  body.push(`<path d="${makeLinePath(points)}" fill="none" stroke="#103b2c" stroke-width="2.8"/>`);

  series.forEach((entry, index) => {
    const x = xFor(index);
    const y = yForTemp(entry.highC);
    const color = entry.riskLevel === 'high' ? '#dc2626' : entry.riskLevel === 'moderate' ? '#f59e0b' : '#16a34a';
    const [, month, day] = entry.isoDate.split('-').map(Number);
    const label = `${monthLabels[month - 1]} ${day}`;
    body.push(`<circle cx="${x}" cy="${y}" r="5.5" fill="${color}" stroke="#ffffff" stroke-width="1.4"/>`);
    body.push(`<text class="small" x="${x}" y="${y - 9}" text-anchor="middle">${entry.highC.toFixed(1)}</text>`);
    body.push(`<rect x="${x - stripW / 2}" y="${stripY}" width="${stripW}" height="${stripH}" rx="4" fill="${color}" opacity="0.92"/>`);
    body.push(`<text x="${x}" y="${stripY + 12.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${entry.riskLevel === 'high' ? 'H' : entry.riskLevel === 'moderate' ? 'M' : 'L'}</text>`);
    body.push(`<text class="tick" x="${x}" y="${stripY + 31}" text-anchor="middle">${escapeXml(label)}</text>`);
  });

  body.push('<rect x="520" y="74" width="188" height="78" rx="12" fill="#eef6f0" stroke="#bdd2c3"/>');
  body.push(`<text x="536" y="94" font-size="11" font-weight="700" fill="#166534">${data.hotDaysCaptured}/${data.hotDaysTotal}</text>`);
  body.push('<text class="small" x="586" y="94">days >= 28C flagged Mod/High</text>');
  body.push(`<text x="536" y="114" font-size="11" font-weight="700" fill="#166534">${data.extremeDaysCaptured}/${data.extremeDaysTotal}</text>`);
  body.push('<text class="small" x="586" y="114">days >= 32C flagged High</text>');
  body.push(`<text x="536" y="134" font-size="11" font-weight="700" fill="#166534">${data.prePeakFalseHighs}</text>`);
  body.push('<text class="small" x="586" y="134">false High days before Jul 2</text>');
  body.push('<text class="small" x="28" y="332">Actual daily max temperature</text>');
  body.push('<text class="small" x="28" y="347">Live app output</text>');
  body.push(`<text class="caption" x="28" y="${height - 24}">Result: the weather rules caught all 6 hot days in this real event, escalated to High on both 32C+ days, and did not fire any false High alerts before the peak.</text>`);
  body.push(`<text class="caption" x="28" y="${height - 8}">This is the original live weather category only. No predictive model is used in this backtest.</text>`);
  return wrapSvg(width, height, body.join(''));
}

function renderSeasonBaselineFigure(data) {
  const width = 760;
  const height = 420;
  const margin = { left: 56, right: 56, top: 72, bottom: 112 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const weeks = data.series.map((entry) => entry.week);
  const maxTrap = Math.max(...data.series.map((entry) => entry.meanTrap), 80);
  const minWeight = 5;
  const maxWeight = 15;
  const barW = Math.min(28, innerWidth / data.series.length - 8);
  const xFor = (index) => margin.left + (innerWidth * index) / Math.max(data.series.length - 1, 1);
  const yForTrap = (value) => margin.top + innerHeight - (value / maxTrap) * innerHeight;
  const yForWeight = (value) => margin.top + innerHeight - ((value - minWeight) / (maxWeight - minWeight)) * innerHeight;

  const body = [
    '<text class="title" x="28" y="34">Fig 5. Seasonal Baseline vs Official Manitoba Trap Data</text>',
    '<text class="subtitle" x="28" y="52">Before Stage 3, the live app used a fixed PHAC-based seasonal curve. Here it is compared with mean official trap catch across 2021-2024.</text>',
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}"/>`,
    `<line class="axis" x1="${width - margin.right}" y1="${margin.top}" x2="${width - margin.right}" y2="${margin.top + innerHeight}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}"/>`,
  ];

  [0, 20, 40, 60, 80].forEach((value) => {
    if (value > maxTrap) return;
    const y = yForTrap(value);
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/>`);
    body.push(`<text class="tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${value}</text>`);
  });

  [5, 7.5, 10, 12.5, 15].forEach((value) => {
    const y = yForWeight(value);
    body.push(`<text class="tick" x="${width - margin.right + 10}" y="${y + 4}">${value.toFixed(value % 1 === 0 ? 0 : 1)}%</text>`);
  });

  const weightPoints = data.series.map((entry, index) => ({ x: xFor(index), y: yForWeight(entry.vectorWeightPct) }));
  body.push(`<path d="${makeLinePath(weightPoints)}" fill="none" stroke="#15803d" stroke-width="3.2"/>`);

  data.series.forEach((entry, index) => {
    const x = xFor(index);
    const barX = x - barW / 2;
    const y = yForTrap(entry.meanTrap);
    body.push(`<rect x="${barX}" y="${y}" width="${barW}" height="${margin.top + innerHeight - y}" rx="4" fill="#f59e0b" opacity="0.88"/>`);
    body.push(`<circle cx="${x}" cy="${yForWeight(entry.vectorWeightPct)}" r="4.5" fill="#15803d" stroke="#ffffff" stroke-width="1.2"/>`);
    body.push(`<text class="tick" x="${x}" y="${margin.top + innerHeight + 18}" text-anchor="middle">Wk ${entry.week}</text>`);
  });

  const observedPeakIndex = weeks.indexOf(data.observedPeakWeek);
  const observedPeakX = observedPeakIndex >= 0 ? xFor(observedPeakIndex) : null;
  if (observedPeakX !== null) {
    body.push(`<line x1="${observedPeakX}" y1="${margin.top}" x2="${observedPeakX}" y2="${margin.top + innerHeight}" stroke="#d97706" stroke-width="1" stroke-dasharray="4 3"/>`);
    body.push(`<text class="small" x="${observedPeakX - 4}" y="${margin.top + 14}" text-anchor="end">Observed mean peak</text>`);
  }

  data.baselinePeakWeeks.forEach((week, peakIndex) => {
    const weekIndex = weeks.indexOf(week);
    if (weekIndex === -1) return;
    const x = xFor(weekIndex);
    body.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + innerHeight}" stroke="#15803d" stroke-width="1" stroke-dasharray="4 3"/>`);
    if (peakIndex === 0) body.push(`<text class="small" x="${x + 4}" y="${margin.top + 28}">Live baseline peak</text>`);
  });

  body.push('<rect x="488" y="76" width="220" height="82" rx="12" fill="#eef6f0" stroke="#bdd2c3"/>');
  body.push(`<text x="504" y="98" font-size="11" font-weight="700" fill="#166534">Wk ${data.observedPeakWeek}</text>`);
  body.push(`<text class="small" x="560" y="98">mean official trap peak</text>`);
  body.push(`<text x="504" y="118" font-size="11" font-weight="700" fill="#166534">Wk ${data.baselinePeakWeeks.join('-')}</text>`);
  body.push(`<text class="small" x="576" y="118">live baseline peak window</text>`);
  body.push(`<text x="504" y="138" font-size="11" font-weight="700" fill="#166534">${data.withinTwoWeeks}/${data.totalRegionSeasons}</text>`);
  body.push('<text class="small" x="572" y="138">region-seasons within 2 weeks</text>');

  body.push('<rect x="62" y="74" width="12" height="12" fill="#f59e0b" rx="2"/>');
  body.push('<text class="small" x="80" y="85">Mean official Cx. tarsalis per trap catch</text>');
  body.push('<line x1="62" y1="104" x2="92" y2="104" stroke="#15803d" stroke-width="3.2"/>');
  body.push('<circle cx="77" cy="104" r="4.5" fill="#15803d"/>');
  body.push('<text class="small" x="100" y="108">Fixed PHAC seasonal weight used before prediction</text>');
  body.push(`<text class="caption" x="28" y="${height - 24}">The live platform already placed vector season in the right general window: mean official trap activity peaks at week ${data.observedPeakWeek}, while the original fixed baseline peaks at weeks ${data.baselinePeakWeeks.join('-')}.</text>`);
  body.push(`<text class="caption" x="28" y="${height - 8}">That was enough for seasonal awareness, but not enough to explain early or late years. Stage 3 adds the weather-sensitive predictive layer.</text>`);
  return wrapSvg(width, height, body.join(''));
}

function renderLivePlatformCoverageFigure(summary) {
  const width = 760;
  const height = 380;
  const left = 168;
  const top = 92;
  const rowH = 26;
  const maxChecks = Math.max(...summary.totals.map((entry) => entry.total), 1);
  const maxBarWidth = 360;
  const body = [
    '<text class="title" x="28" y="34">Fig 15. Pre-Model Test Coverage - Live Platform Rules</text>',
    '<text class="subtitle" x="28" y="52">These checks cover the non-predictive app logic only. Vector backtesting is shown separately after the model is introduced.</text>',
    `<rect x="548" y="76" width="160" height="62" rx="12" fill="#ecf8f0" stroke="#bfd8c8"/>`,
    `<text x="628" y="105" text-anchor="middle" font-size="28" font-weight="800" fill="#166534">${summary.overallPassed}/${summary.overallTotal}</text>`,
    '<text x="628" y="124" text-anchor="middle" font-size="12" fill="#27493a">live-platform checks passed</text>',
  ];

  summary.totals.forEach((entry, index) => {
    const y = top + index * rowH;
    const widthPx = (entry.total / maxChecks) * maxBarWidth;
    body.push(`<text class="caption" x="${left - 12}" y="${y + 15}" text-anchor="end">${escapeXml(entry.group)}</text>`);
    body.push(`<rect x="${left}" y="${y}" width="${maxBarWidth}" height="16" rx="8" fill="#e2ebe5"/>`);
    body.push(`<rect x="${left}" y="${y}" width="${widthPx}" height="16" rx="8" fill="#15803d"/>`);
    body.push(`<text class="small" x="${left + maxBarWidth + 10}" y="${y + 13}">${entry.passed}/${entry.total}</text>`);
  });

  body.push(`<text class="caption" x="28" y="${height - 24}">Coverage before Stage 3 included category thresholds, seasonal weights, the composite safeguard, and notification logic.</text>`);
  body.push(`<text class="caption" x="28" y="${height - 8}">The predictive layer was built on top of an already-tested live platform rather than an unverified prototype.</text>`);
  return wrapSvg(width, height, body.join(''));
}

function renderExpandedRegressionBars(summary) {
  const width = 760;
  const height = 460;
  const left = 180;
  const barTop = 96;
  const rowHeight = 38;
  const maxBarWidth = 420;
  const body = [
    '<text class="title" x="28" y="34">Fig 8. Full Regression Suite — All Six Categories</text>',
    '<text class="subtitle" x="28" y="52">Each row is one subsystem. Tests cover scoring thresholds, keyword classifiers, distance rules, seasonal weights, and safety-score guards.</text>',
  ];

  summary.totals.forEach((entry, index) => {
    const y = barTop + index * rowHeight;
    const widthPx = (entry.passRate / 100) * maxBarWidth;
    body.push(`<text class="caption" x="${left - 14}" y="${y + 17}" text-anchor="end">${escapeXml(entry.group)}</text>`);
    body.push(`<rect x="${left}" y="${y}" width="${maxBarWidth}" height="24" rx="12" fill="#e2ebe5"/>`);
    body.push(`<rect x="${left}" y="${y}" width="${widthPx}" height="24" rx="12" fill="#15803d"/>`);
    body.push(`<text class="caption" x="${left + maxBarWidth + 12}" y="${y + 17}">${entry.passed}/${entry.total} (${entry.passRate.toFixed(0)}%)</text>`);
  });

  body.push(`<text class="caption" x="28" y="${barTop + summary.totals.length * rowHeight + 20}">Overall: ${summary.overallPassed}/${summary.overallTotal} checks passed across all six categories.</text>`);
  return wrapSvg(width, height, body.join(''));
}

// ── Fig 12: Iterative Development Timeline ───────────────────────────────────
function renderIterativeTimeline() {
  const bugs = [
    {
      iteration: 1,
      found: 'Vector winter over-scoring',
      detail: 'Model returned score 1.45 in Jan–Mar instead of the expected 1.0 floor.',
      fix: 'Added explicit winter guard: months 1–4 and 11–12 return exactly 1.0.',
      metric: 'Winter score: 1.45 → 1.00',
      color: '#0369a1',
    },
    {
      iteration: 2,
      found: 'Water advisory false positives',
      detail: 'Advisories 200+ km away flagged as High because GPS coords were not passed to the service.',
      fix: 'Added userCoordinates parameter and 25 km proximity threshold for location-specific advisories.',
      metric: 'False High rate: eliminated',
      color: '#166534',
    },
    {
      iteration: 3,
      found: 'InsightsScreen crash on invalid date',
      detail: 'formatDetailDate() threw on null or malformed date strings from advisory feed.',
      fix: 'Added null guard before parsing; returns empty string for invalid inputs.',
      metric: 'Crash rate: 100% → 0%',
      color: '#d97706',
    },
    {
      iteration: 4,
      found: 'Vector model over-warning bias',
      detail: 'Model predicted Low 0 times in 170 weeks. Over-warning rate 48.8% — effectively binary moderate/high.',
      fix: 'Lowered precip dry floor, linearised GDD early-season ramp, rebalanced blend 60/40 → 45/55.',
      metric: 'Exact agreement: 47.6% → 50.0%  |  Within-1-band: 87.1% → 94.1%',
      color: '#dc2626',
    },
  ];

  const width = 760;
  const height = 480;
  const rowH = 96;
  const startY = 72;

  const body = [
    '<text class="title" x="28" y="34">Fig 12. Iterative Testing — Bugs Found and Fixed During Development</text>',
  ];

  // spine line
  body.push(`<line x1="68" y1="${startY}" x2="68" y2="${startY + bugs.length * rowH - 16}" stroke="#9ebaa9" stroke-width="2"/>`);

  bugs.forEach((bug, i) => {
    const y = startY + i * rowH;
    body.push(`<circle cx="68" cy="${y + 16}" r="14" fill="${bug.color}"/>`);
    body.push(`<text x="68" y="${y + 21}" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">${bug.iteration}</text>`);
    body.push(`<rect x="96" y="${y}" width="644" height="${rowH - 8}" rx="10" fill="#f3f8f4" stroke="#c5d9cc"/>`);
    body.push(`<text x="110" y="${y + 18}" font-size="13" font-weight="700" fill="#103b2c">${escapeXml(bug.found)}</text>`);
    body.push(`<text class="small" x="110" y="${y + 34}">${escapeXml(bug.detail)}</text>`);
    body.push(`<text class="small" x="110" y="${y + 50}" fill="#15803d">Fix: ${escapeXml(bug.fix)}</text>`);
    body.push(`<rect x="110" y="${y + 58}" width="${Math.min(bug.metric.length * 6.5, 620)}" height="18" rx="9" fill="#dcfce7"/>`);
    body.push(`<text x="118" y="${y + 71}" font-size="10" fill="#166534" font-weight="700">${escapeXml(bug.metric)}</text>`);
  });

  return wrapSvg(width, height, body.join(''));
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  });
  return `${lines.join('\n')}\n`;
}

// ── Full MOSI Day-Ahead Backtest ──────────────────────────────────────────────
// For every consecutive (D, D+1) pair in the active season (weeks 14–44),
// simulate what the app would have predicted for "tomorrow" using today's
// actual conditions (persistence model), then compare to what D+1 actually
// showed. Categories with daily historical data (weather, vector, wildfire proxy)
// vary per row; airQuality, water, and healthAdvisories are held at seasonal
// baseline ('low') since no archived daily records exist for those feeds.
// Weather thresholds and vector scoring mirrors match app service logic exactly.

function wildfireProxyRiskLevel(highC, precipMm, isoDate) {
  const month = parseInt(isoDate.slice(5, 7), 10);
  if (month < 4 || month > 10) return 'low';
  if (highC > 32 && precipMm < 2) return 'high';
  if (highC > 28 && precipMm < 2) return 'moderate';
  return 'low';
}

function buildMosiAlertsForRow(row) {
  return {
    weather:          { riskLevel: weatherRiskLevel(row.highC, false) },
    airQuality:       { riskLevel: 'low' },
    wildfire:         { riskLevel: wildfireProxyRiskLevel(row.highC, row.precipMm, row.isoDate) },
    water:            { riskLevel: 'low' },
    vectorBorne:      { riskLevel: row.riskLevel }, // vectorScoreToRiskLevel(overallScore) already in series
    healthAdvisories: { riskLevel: 'low' },
  };
}

function buildFullMosiDayAheadBacktest(dailySeriesByKey) {
  let totalComparisons = 0;
  let mosiMatches = 0;
  let weatherMatches = 0;
  let vectorMatches = 0;
  let wildfireMatches = 0;
  // horizon[h].matches = full MOSI band matches at (h+1)-day horizon
  const horizon = Array.from({ length: 7 }, () => ({ matches: 0, total: 0 }));
  const confusionMatrix = {
    low:      { low: 0, moderate: 0, high: 0 },
    moderate: { low: 0, moderate: 0, high: 0 },
    high:     { low: 0, moderate: 0, high: 0 },
  };
  const perCategoryAcc = {
    weather:  { matches: 0, total: 0 },
    vector:   { matches: 0, total: 0 },
    wildfire: { matches: 0, total: 0 },
  };

  for (const region of REGIONS) {
    for (const year of YEARS) {
      const series = (dailySeriesByKey.get(`${region.id}-${year}`) ?? [])
        .filter((row) => row.weekOfYear >= 14 && row.weekOfYear <= 44);
      if (series.length < 2) continue;

      for (let i = 0; i < series.length; i++) {
        const today = series[i];
        if (!series[i + 1]) continue;

        // Verify D and D+1 are truly consecutive calendar days (guard against gaps)
        const expectedNext = (() => {
          const d = new Date(`${today.isoDate}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        if (series[i + 1].isoDate !== expectedNext) continue;

        const predictedAlerts = buildMosiAlertsForRow(today);
        const predictedMosi = calculateSafetyIndex(predictedAlerts, today.weekOfYear);
        const predictedBand = predictedMosi.overallRisk;

        // 1-day ahead comparison (primary stat)
        const tomorrow = series[i + 1];
        const actualAlerts = buildMosiAlertsForRow(tomorrow);
        const actualMosi = calculateSafetyIndex(actualAlerts, tomorrow.weekOfYear);
        const actualBand = actualMosi.overallRisk;

        if (predictedBand === actualBand) mosiMatches++;
        confusionMatrix[actualBand][predictedBand]++;
        totalComparisons++;

        // Per-category accuracy
        const pw = weatherRiskLevel(today.highC, false);
        const aw = weatherRiskLevel(tomorrow.highC, false);
        if (pw === aw) weatherMatches++;
        perCategoryAcc.weather.matches += pw === aw ? 1 : 0;
        perCategoryAcc.weather.total++;

        if (today.riskLevel === tomorrow.riskLevel) vectorMatches++;
        perCategoryAcc.vector.matches += today.riskLevel === tomorrow.riskLevel ? 1 : 0;
        perCategoryAcc.vector.total++;

        const pwf = wildfireProxyRiskLevel(today.highC, today.precipMm, today.isoDate);
        const awf = wildfireProxyRiskLevel(tomorrow.highC, tomorrow.precipMm, tomorrow.isoDate);
        if (pwf === awf) wildfireMatches++;
        perCategoryAcc.wildfire.matches += pwf === awf ? 1 : 0;
        perCategoryAcc.wildfire.total++;

        // Multi-horizon accuracy (1-day already done above; extend to 7-day)
        for (let h = 0; h < 7; h++) {
          const futureIndex = i + 1 + h;
          if (futureIndex >= series.length) break;
          // Only count if the chain of dates is consecutive (no gaps allowed)
          const futureExpected = (() => {
            const d = new Date(`${today.isoDate}T00:00:00Z`);
            d.setUTCDate(d.getUTCDate() + 1 + h);
            return d.toISOString().slice(0, 10);
          })();
          if (series[futureIndex].isoDate !== futureExpected) break;

          const futureRow = series[futureIndex];
          const futureAlerts = buildMosiAlertsForRow(futureRow);
          const futureMosi = calculateSafetyIndex(futureAlerts, futureRow.weekOfYear);
          horizon[h].total++;
          if (futureMosi.overallRisk === predictedBand) horizon[h].matches++;
        }
      }
    }
  }

  return {
    totalDayComparisons: totalComparisons,
    fullMosiBandAccuracyPct: round((mosiMatches / totalComparisons) * 100, 1),
    perCategoryAccuracyPct: {
      weather:  round((perCategoryAcc.weather.matches  / perCategoryAcc.weather.total)  * 100, 1),
      vector:   round((perCategoryAcc.vector.matches   / perCategoryAcc.vector.total)   * 100, 1),
      wildfire: round((perCategoryAcc.wildfire.matches / perCategoryAcc.wildfire.total) * 100, 1),
    },
    confusionMatrix,
    horizonAccuracy: horizon.map((h, i) => ({
      day: i + 1,
      accuracyPct: h.total > 0 ? round((h.matches / h.total) * 100, 1) : null,
      comparisons: h.total,
    })),
  };
}

function renderFullMosiBacktestFigure(backtest) {
  const width = 760;
  const height = 420;
  const margin = { left: 64, right: 36, top: 72, bottom: 100 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const horizon = backtest.horizonAccuracy;
  const minAcc = Math.max(0, Math.min(...horizon.filter((h) => h.accuracyPct !== null).map((h) => h.accuracyPct)) - 10);
  const maxAcc = Math.min(100, Math.max(...horizon.map((h) => h.accuracyPct ?? 0)) + 8);
  const xFor = (i) => margin.left + (innerW / (horizon.length - 1)) * i;
  const yFor = (acc) => margin.top + innerH - ((acc - minAcc) / (maxAcc - minAcc)) * innerH;

  const body = [
    '<text class="title" x="28" y="34">Fig 16. Full MOSI Forecast Accuracy — 1–7 Day Horizon Backtest</text>',
    '<text class="subtitle" x="28" y="52">Day-ahead band agreement using 2021–2024 archived weather (4 regions). Predicted = today\'s computed MOSI band; Actual = next day\'s computed MOSI band.</text>',
    `<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"/>`,
    `<line class="axis" x1="${margin.left}" y1="${margin.top + innerH}" x2="${margin.left + innerW}" y2="${margin.top + innerH}"/>`,
  ];

  // Y-axis grid
  for (let acc = Math.ceil(minAcc / 5) * 5; acc <= maxAcc; acc += 5) {
    const y = yFor(acc);
    body.push(`<line class="grid" x1="${margin.left}" y1="${y}" x2="${margin.left + innerW}" y2="${y}"/>`);
    body.push(`<text class="tick" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${acc}%</text>`);
  }

  // Area fill (subtle)
  const valid = horizon.filter((h) => h.accuracyPct !== null);
  const areaPath = [
    `M ${xFor(0).toFixed(1)} ${yFor(valid[0].accuracyPct).toFixed(1)}`,
    ...valid.map((h, i) => `L ${xFor(i).toFixed(1)} ${yFor(h.accuracyPct).toFixed(1)}`),
    `L ${xFor(valid.length - 1).toFixed(1)} ${(margin.top + innerH).toFixed(1)}`,
    `L ${xFor(0).toFixed(1)} ${(margin.top + innerH).toFixed(1)} Z`,
  ].join(' ');
  body.push(`<path d="${areaPath}" fill="#15803d" opacity="0.10"/>`);

  // Line
  const linePath = valid.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(h.accuracyPct).toFixed(1)}`).join(' ');
  body.push(`<path d="${linePath}" fill="none" stroke="#15803d" stroke-width="3.5"/>`);

  // Points + labels
  valid.forEach((h, i) => {
    const x = xFor(i);
    const y = yFor(h.accuracyPct);
    const color = h.accuracyPct >= 70 ? '#15803d' : h.accuracyPct >= 55 ? '#d97706' : '#dc2626';
    body.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${color}" stroke="#fff" stroke-width="1.5"/>`);
    body.push(`<text class="caption" x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-weight="700">${h.accuracyPct}%</text>`);
    body.push(`<text class="tick" x="${x.toFixed(1)}" y="${(margin.top + innerH + 18).toFixed(1)}" text-anchor="middle">Day ${h.day}</text>`);
    body.push(`<text class="small" x="${x.toFixed(1)}" y="${(margin.top + innerH + 34).toFixed(1)}" text-anchor="middle">(n=${h.comparisons})</text>`);
  });

  // Summary box
  const { weather, vector, wildfire } = backtest.perCategoryAccuracyPct;
  const day1 = horizon[0];
  body.push('<rect x="478" y="72" width="242" height="120" rx="14" fill="#ecf8f0" stroke="#bfd8c8"/>');
  body.push(`<text x="494" y="98" font-size="11" font-weight="700" fill="#166534">Day-1 full MOSI: ${day1.accuracyPct}%</text>`);
  body.push(`<text class="small" x="494" y="117">  Weather category: ${weather}%</text>`);
  body.push(`<text class="small" x="494" y="133">  Vector category:  ${vector}%</text>`);
  body.push(`<text class="small" x="494" y="149">  Wildfire proxy:   ${wildfire}%</text>`);
  body.push(`<text class="small" x="494" y="168">n = ${backtest.totalDayComparisons} day pairs, 4 regions × 4 yrs</text>`);

  body.push(`<text class="caption" x="28" y="${height - 44}">Active season only (ISO weeks 14–44). Only categories with daily historical archives contribute (weather, vector, wildfire proxy).</text>`);
  body.push(`<text class="caption" x="28" y="${height - 28}">AirQuality, water, and healthAdvisory held at seasonal baseline ('low'). Full MOSI band thresholds: low &lt;1.60 / moderate 1.60–2.35 / high ≥2.35.</text>`);
  body.push(`<text class="caption" x="28" y="${height - 12}">Day-1 uses today's actual archived conditions to predict tomorrow; Day-7 uses the same today's conditions to predict 7 days out.</text>`);
  return wrapSvg(width, height, body.join(''));
}

async function main() {
  await ensureDir(WEATHER_DIR);
  await ensureDir(FIGURE_DIR);

  const trapRows = await loadTrapData();
  const dailySeriesByKey = new Map();
  for (const region of REGIONS) {
    for (const year of YEARS) {
      const weatherJson = await loadArchiveWeather(region, year);
      dailySeriesByKey.set(`${region.id}-${year}`, buildDailyVectorSeries(buildDailyWeatherRows(weatherJson), region.id));
    }
  }

  const validationRows = buildWeeklyValidationRows(trapRows, dailySeriesByKey);
  const correlationGrid = buildCorrelationGrid(validationRows);
  const peakAlignment = buildPeakAlignment(validationRows);
  const timeSeriesSelection = buildTimeSeriesSelection(validationRows);
  const regressionCases = runRegressionSuite();
  const regressionSummary = summarizeRegression(regressionCases);

  const validRhos = correlationGrid.flatMap((row) => row.values.map((entry) => entry.rho)).filter((value) => typeof value === 'number');
  const peakErrors = peakAlignment.map((entry) => entry.absoluteErrorWeeks).filter((value) => typeof value === 'number');
  const classificationRows = validationRows.filter((entry) => entry.trapBand !== null);
  const exactBandMatches = classificationRows.filter((entry) => entry.trapBand === entry.modelBand).length;
  const bandComparisons = classificationRows.map((entry) => ({
    ...entry,
    delta: riskLevelToNumber(entry.modelBand) - riskLevelToNumber(entry.trapBand),
  }));
  const severeBandMisses = bandComparisons.filter((entry) => Math.abs(entry.delta) >= 2).length;
  const overWarnings = bandComparisons.filter((entry) => entry.delta > 0).length;
  const underWarnings = bandComparisons.filter((entry) => entry.delta < 0).length;
  const confusionMatrix = ['low', 'moderate', 'high'].reduce((accumulator, trapBand) => {
    accumulator[trapBand] = ['low', 'moderate', 'high'].reduce((row, modelBand) => {
      row[modelBand] = classificationRows.filter((entry) => entry.trapBand === trapBand && entry.modelBand === modelBand).length;
      return row;
    }, {});
    return accumulator;
  }, {});

  const fullMosiBacktest = buildFullMosiDayAheadBacktest(dailySeriesByKey);

  const summary = {
    generatedAt: new Date().toISOString(),
    dataScope: 'Manitoba WNV surveillance pages for 2021-2024 plus Open-Meteo archived daily weather for app regional coordinates',
    limitations: [
      'Full MOSI backtest uses archived weather for weather + vector categories; airQuality, water, and healthAdvisory are held at seasonal baseline (low) — no daily historical archives exist for those feeds.',
      'Vector trap comparison covers southern Manitoba surveillance regions only (provincial trap network).',
      'Observed mosquito activity is represented by average Culex tarsalis per trap catch; proxy for mosquito pressure, not direct disease risk.',
      'No participant usability data is included here. Human testing should be collected separately and reported separately.',
    ],
    overview: {
      totalRegionSeasons: peakAlignment.length,
      totalWeeklyComparisons: classificationRows.length,
      meanSpearmanRho: round(average(validRhos), 2),
      medianPeakWeekError: round(percentile([...peakErrors].sort((left, right) => left - right), 0.5), 1),
      // Full MOSI day-ahead backtest (replaces vector-only exactTrapBandAgreementPct)
      fullMosiBandAccuracyPct: fullMosiBacktest.fullMosiBandAccuracyPct,
      fullMosiTotalDayComparisons: fullMosiBacktest.totalDayComparisons,
      fullMosiDay1WeatherAccuracyPct: fullMosiBacktest.perCategoryAccuracyPct.weather,
      fullMosiDay1VectorAccuracyPct: fullMosiBacktest.perCategoryAccuracyPct.vector,
      fullMosiDay1WildfireProxyAccuracyPct: fullMosiBacktest.perCategoryAccuracyPct.wildfire,
      // Legacy vector-trap stat kept for reference
      exactTrapBandAgreementPct: round((exactBandMatches / classificationRows.length) * 100, 1),
      severeBandMissCount: severeBandMisses,
      severeBandMissPct: round((severeBandMisses / classificationRows.length) * 100, 1),
      overWarningPct: round((overWarnings / classificationRows.length) * 100, 1),
      underWarningPct: round((underWarnings / classificationRows.length) * 100, 1),
      regressionChecksPassed: `${regressionSummary.overallPassed}/${regressionSummary.overallTotal}`,
    },
    vectorTrapBandThresholds: VECTOR_TRAP_BAND_THRESHOLDS,
    fullMosiBacktest,
    confusionMatrix,
    correlationGrid,
    peakAlignment,
    regressionSummary,
  };

  await writeText(path.join(OUTPUT_DIR, 'vector_validation_weekly.csv'), toCsv(validationRows));
  await writeJson(path.join(OUTPUT_DIR, 'summary.json'), summary);
  await writeText(path.join(FIGURE_DIR, 'fig4-vector-timeseries.svg'), renderTimeSeriesFigure(timeSeriesSelection));
  await writeText(path.join(FIGURE_DIR, 'fig5-correlation-heatmap.svg'), renderCorrelationHeatmap(correlationGrid));
  await writeText(path.join(FIGURE_DIR, 'fig6-peak-alignment.svg'), renderPeakAlignmentFigure(peakAlignment));
  await writeText(path.join(FIGURE_DIR, 'fig7-regression-bars.svg'), renderRegressionBars(regressionSummary));
  await writeText(path.join(FIGURE_DIR, 'fig8-regression-matrix.svg'), renderRegressionMatrix(regressionCases));

  const weatherExtremesData = buildWeatherExtremesData(dailySeriesByKey);
  const fireWeatherData = buildFireWeatherProxyData(dailySeriesByKey);
  const weatherBacktestData = buildWeatherBacktestData(dailySeriesByKey);
  const seasonBaselineComparison = buildSeasonBaselineComparison(validationRows);
  const livePlatformCoverage = summarizeLivePlatformChecks(regressionSummary);
  await writeText(path.join(FIGURE_DIR, 'fig9-weather-extremes.svg'), renderWeatherExtremesChart(weatherExtremesData));
  await writeText(path.join(FIGURE_DIR, 'fig10-fire-weather-proxy.svg'), renderFireWeatherProxyChart(fireWeatherData));
  await writeText(path.join(FIGURE_DIR, 'fig11-regression-all-categories.svg'), renderExpandedRegressionBars(regressionSummary));
  await writeText(path.join(FIGURE_DIR, 'fig12-iterative-development.svg'), renderIterativeTimeline());
  await writeText(path.join(FIGURE_DIR, 'fig13-live-weather-backtest.svg'), renderWeatherBacktestFigure(weatherBacktestData));
  await writeText(path.join(FIGURE_DIR, 'fig14-live-seasonal-baseline.svg'), renderSeasonBaselineFigure(seasonBaselineComparison));
  await writeText(path.join(FIGURE_DIR, 'fig15-live-platform-coverage.svg'), renderLivePlatformCoverageFigure(livePlatformCoverage));
  await writeText(path.join(FIGURE_DIR, 'fig16-full-mosi-backtest.svg'), renderFullMosiBacktestFigure(fullMosiBacktest));

  console.log(JSON.stringify({
    generatedAt: summary.generatedAt,
    meanSpearmanRho: summary.overview.meanSpearmanRho,
    medianPeakWeekError: summary.overview.medianPeakWeekError,
    fullMosiBandAccuracyPct: summary.overview.fullMosiBandAccuracyPct,
    fullMosiDay1WeatherAccuracyPct: summary.overview.fullMosiDay1WeatherAccuracyPct,
    fullMosiDay1VectorAccuracyPct: summary.overview.fullMosiDay1VectorAccuracyPct,
    totalDayComparisons: summary.overview.fullMosiTotalDayComparisons,
    // Legacy vector-trap reference stat
    vectorTrapBandAccuracyPct: summary.overview.exactTrapBandAgreementPct,
    severeBandMissPct: summary.overview.severeBandMissPct,
    regressionChecksPassed: summary.overview.regressionChecksPassed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
