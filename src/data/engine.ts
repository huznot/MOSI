import { createRng } from './seed';
import { regions } from './regions';
import { AppDataset, DomainId, DomainRiskData, Region, WeeklyRegionRecord } from './types';
import { clamp, labelFromScore } from '../utils/risk';

const REFERENCE_END_DATE = new Date('2026-02-23T00:00:00.000Z');
const TOTAL_WEEKS = 5 * 52;

function isoWeekDate(index: number) {
  const next = new Date(REFERENCE_END_DATE);
  next.setUTCDate(next.getUTCDate() - ((TOTAL_WEEKS - 1 - index) * 7));
  return next.toISOString();
}

function seasonalWave(weekIndex: number, phase = 0) {
  return Math.sin(((weekIndex % 52) / 52) * Math.PI * 2 + phase);
}

function dome(value: number) {
  return clamp((value + 1) / 2);
}

function buildDomainData(domain: DomainId, score: number, baseline: number, features: Record<string, number>): DomainRiskData {
  return {
    score: clamp(score),
    baseline: clamp(baseline),
    label: labelFromScore(score),
    features,
  };
}

function generateWeek(region: Region, weekIndex: number, rng: () => number) {
  const summer = dome(seasonalWave(weekIndex, -Math.PI / 2));
  const shoulder = dome(seasonalWave(weekIndex, -0.2));
  const winter = 1 - summer;
  const stormCycle = dome(seasonalWave(weekIndex, 1.1));
  const regionPulse = dome(seasonalWave(weekIndex, region.airFactor * 2.5));
  const noise = () => (rng() - 0.5) * 0.18;

  const expectedTemp = -14 + (24 * summer) - region.northFactor * 9;
  const temp = expectedTemp + (stormCycle - 0.5) * 7 + noise() * 12;
  const tempAnomaly = (temp - expectedTemp) / 12;
  const humidexProxy = clamp((temp - 18) / 16 + summer * 0.22 + noise());
  const coldSnapProxy = clamp((-temp - 18) / 18 + region.northFactor * 0.15);
  const precipitation = clamp(0.28 + shoulder * 0.26 + stormCycle * 0.18 + region.waterFactor * 0.18 + noise());
  const rainfallRunoff = clamp(precipitation * 0.72 + clamp(temp / 28) * 0.22 + noise());
  const turbidity = clamp(0.24 + rainfallRunoff * 0.5 + region.waterFactor * 0.28 + noise());
  const advisoryFlag = turbidity > 0.68 || rainfallRunoff > 0.74 ? 1 : 0;
  const smokeSpike = clamp((Math.sin(weekIndex * 0.19 + region.airFactor * 7) - 0.55) * 1.8) * summer;
  const smokeIndex = clamp(0.08 + summer * 0.42 + regionPulse * 0.22 + smokeSpike + region.airFactor * 0.16 + noise());
  const pm25Proxy = clamp(smokeIndex * 0.82 + summer * 0.1 + noise());
  const wind = clamp(0.46 + dome(seasonalWave(weekIndex, 0.7)) * 0.24 + noise());
  const vegetationProxy = clamp(0.2 + summer * 0.42 + precipitation * 0.18 + region.vectorFactor * 0.2 + noise());
  const vectorTemp = clamp((temp + 2) / 24);

  const airBaseline = clamp(0.14 + summer * 0.44 + region.airFactor * 0.1);
  const airScore = clamp(0.08 + smokeIndex * 0.52 + pm25Proxy * 0.26 - wind * 0.14 + region.airFactor * 0.12);

  const waterBaseline = clamp(0.12 + shoulder * 0.28 + region.waterFactor * 0.16);
  const waterScore = clamp(0.09 + turbidity * 0.46 + rainfallRunoff * 0.24 + advisoryFlag * 0.18 + region.waterFactor * 0.08);

  const vectorBaseline = clamp(0.08 + summer * 0.5 + region.vectorFactor * 0.14);
  const vectorScore = clamp(0.06 + vectorTemp * 0.38 + precipitation * 0.18 + vegetationProxy * 0.24 + region.vectorFactor * 0.12);

  const heatStress = clamp(0.05 + humidexProxy * 0.66 + clamp(tempAnomaly + 0.25) * 0.14);
  const coldStress = clamp(0.08 + coldSnapProxy * 0.72 + region.northFactor * 0.08);
  const heatBaseline = clamp(0.12 + Math.max(summer * 0.42, winter * 0.42) + region.northFactor * 0.06);
  const heatScore = clamp(Math.max(heatStress, coldStress));

  return {
    air: buildDomainData('air', airScore, airBaseline, {
      smoke_index: smokeIndex,
      pm25_proxy: pm25Proxy,
      wind,
    }),
    water: buildDomainData('water', waterScore, waterBaseline, {
      turbidity_proxy: turbidity,
      rainfall_runoff_proxy: rainfallRunoff,
      advisory_flag: advisoryFlag,
    }),
    vectors: buildDomainData('vectors', vectorScore, vectorBaseline, {
      temp,
      precipitation,
      vegetation_proxy: vegetationProxy,
      seasonality: summer,
    }),
    heat: buildDomainData('heat', heatScore, heatBaseline, {
      temp_anomaly: tempAnomaly,
      humidex_proxy: humidexProxy,
      cold_snap_proxy: coldSnapProxy,
    }),
  };
}

export function generateDataset(seed: string): AppDataset {
  const history: Record<string, WeeklyRegionRecord[]> = {};
  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, weekIndex) => isoWeekDate(weekIndex));

  regions.forEach((region) => {
    const rng = createRng(`${seed}-${region.id}`);
    history[region.id] = weeks.map((date, weekIndex) => ({
      weekIndex,
      date,
      domains: generateWeek(region, weekIndex, rng),
    }));
  });

  return {
    seed,
    weeks,
    regions,
    history,
  };
}
