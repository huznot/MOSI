import { createLightColors } from '../theme';
import { RiskLevel } from '../types/alerts';

const fallbackColors = createLightColors();

type RiskColorPalette = {
  riskHigh: string;
  riskModerate: string;
  riskLow: string;
};

export function getRiskColor(riskLevel: RiskLevel, colors: RiskColorPalette = fallbackColors) {
  if (riskLevel === 'high') {
    return colors.riskHigh;
  }
  if (riskLevel === 'moderate') {
    return colors.riskModerate;
  }
  return colors.riskLow;
}

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function labelFromScore(score: number) {
  if (score >= 0.7) {
    return 'High';
  }
  if (score >= 0.4) {
    return 'Med';
  }
  return 'Low';
}

export function getTrendDirection(trend: number) {
  if (trend >= 0.03) {
    return 'up';
  }
  if (trend <= -0.03) {
    return 'down';
  }
  return 'flat';
}

export function normalizeTrend(trend: number) {
  return clamp((trend + 0.2) / 0.4);
}

export function getScenarioShift(domain: string, delta: number) {
  if (domain === 'heat') {
    return delta * 0.045;
  }
  if (domain === 'vectors') {
    return delta * 0.03;
  }
  return 0;
}

export function normalizeMosiScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return clamp((score - 1) / 2, 0, 1);
}

export function toDisplayedMosiScore(score: number, digits = 1) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  const factor = 10 ** digits;
  return Math.round(((score - 1) * 1.5) * factor) / factor;
}

export function toMosiDisplayScore(score: number) {
  return Math.round(normalizeMosiScore(score) * 100);
}
