
export type PhacBaselineResult = {
  weekOfYear: number;
  normalizedRisk: number;
  seasonActive: boolean;
};

export function getBaselineForWeek(weekOfYear: number): PhacBaselineResult {
  const MU = 31.5;
  const SIGMA = 6.0;
  const seasonActive = weekOfYear >= 18 && weekOfYear <= 43;

  const gaussian = Math.exp(-0.5 * Math.pow((weekOfYear - MU) / SIGMA, 2));

  const normalizedRisk = seasonActive ? gaussian : Math.min(gaussian, 0.03);

  return { weekOfYear, normalizedRisk, seasonActive };
}

export function getCxTarsalisDiapauseFactor(weekOfYear: number): number {
  if (weekOfYear <= 30) return 1.0;
  if (weekOfYear >= 37) return 0.0;
  return 1.0 - (weekOfYear - 30) / 7;
}

export function getWeekOfYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function estimateSeasonalGDD(weekOfYear: number): number {

  if (weekOfYear <= 17) return 0;
  if (weekOfYear >= 48) return 503;

  const breakpoints: [number, number][] = [
    [17,   0],
    [22,  50],
    [27, 168],
    [31, 285],
    [35, 386],
    [39, 453],
    [43, 494],
    [48, 503],
  ];

  for (let i = 1; i < breakpoints.length; i++) {
    const [w0, g0] = breakpoints[i - 1];
    const [w1, g1] = breakpoints[i];
    if (weekOfYear <= w1) {
      const t = (weekOfYear - w0) / (w1 - w0);
      return g0 + t * (g1 - g0);
    }
  }

  return 600;
}

export function getAedesTemperatureFactor(temperatureC: number): number {
  if (temperatureC < 7) return 0;
  if (temperatureC < 12) return ((temperatureC - 7) / 5) * 0.5;
  if (temperatureC < 18) return 0.5 + ((temperatureC - 12) / 6) * 0.5;
  if (temperatureC <= 25) return 1.0;
  if (temperatureC < 30) return 1.0 - ((temperatureC - 25) / 5) * 0.8;
  return Math.max(0, 0.2 - ((temperatureC - 30) / 4) * 0.2);
}

export function getAedesSeasonFactor(weekOfYear: number): number {
  if (weekOfYear < 18 || weekOfYear > 38) return 0;
  const MU = 26.0;
  const SIGMA = 5.5;
  return Math.exp(-0.5 * Math.pow((weekOfYear - MU) / SIGMA, 2));
}

export function getSnowshoeHareCycleFactor(year: number): number {
  const harePhaseFraction = (year - 2020) / 10;
  return (Math.cos(2 * Math.PI * harePhaseFraction) + 1) / 2;
}

export function getAedesBorealFactor(temperatureC: number, weekOfYear: number, year: number): number {
  const tempFactor = getAedesTemperatureFactor(temperatureC);
  const seasonFactor = getAedesSeasonFactor(weekOfYear);
  const hareCycleFactor = getSnowshoeHareCycleFactor(year);

  const jcvFactor = tempFactor * seasonFactor;
  const shvFactor = tempFactor * seasonFactor * (0.4 + 0.6 * hareCycleFactor);

  return 0.6 * jcvFactor + 0.4 * shvFactor;
}

export function getIxodesQuestingTemperatureFactor(temperatureC: number): number {
  if (temperatureC < 4) return 0;
  if (temperatureC < 6) return (temperatureC - 4) / 2;
  if (temperatureC <= 20) return 1.0;
  if (temperatureC < 26) return 1.0 - (temperatureC - 20) / 6;
  return 0;
}

export function getIxodesSeasonFactor(weekOfYear: number): number {
  if (weekOfYear < 14 || weekOfYear > 44) return 0;
  if (weekOfYear < 18) return 0.5 + ((weekOfYear - 14) / 4) * 0.5;
  if (weekOfYear <= 31) return 1.0;
  if (weekOfYear <= 35) return 0.35;
  return 0.5;
}
