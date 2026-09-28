import { SAFETY_INDEX_WEIGHTS } from '../constants/config';
import { CategoryAlert, CategoryId, RiskLevel, SafetyIndexResult } from '../types/alerts';
import { getBaselineForWeek } from './phacBaseline';

const RISK_NUMERIC: Record<RiskLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
};

export function riskLevelToNumber(riskLevel: RiskLevel) {
  return RISK_NUMERIC[riskLevel];
}

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 2.35) {
    return 'high';
  }
  if (score >= 1.6) {
    return 'moderate';
  }
  return 'low';
}

export function getSeasonalWeights(weekOfYear: number): Record<CategoryId, number> {
  const { normalizedRisk } = getBaselineForWeek(weekOfYear);

  const vectorBorneWeight = 0.05 + 0.10 * normalizedRisk;
  const delta = vectorBorneWeight - SAFETY_INDEX_WEIGHTS.vectorBorne;
  const otherSum = 1.0 - SAFETY_INDEX_WEIGHTS.vectorBorne;
  const scale = delta / otherSum;
  return {
    weather:          SAFETY_INDEX_WEIGHTS.weather          * (1 - scale),
    airQuality:       SAFETY_INDEX_WEIGHTS.airQuality       * (1 - scale),
    wildfire:         SAFETY_INDEX_WEIGHTS.wildfire          * (1 - scale),
    water:            SAFETY_INDEX_WEIGHTS.water             * (1 - scale),
    vectorBorne:      vectorBorneWeight,
    healthAdvisories: SAFETY_INDEX_WEIGHTS.healthAdvisories * (1 - scale),
  };
}

export function calculateSafetyIndex(
  alerts: Record<CategoryId, CategoryAlert>,
  weekOfYear?: number,
): SafetyIndexResult {
  const weights: Record<CategoryId, number> =
    weekOfYear !== undefined ? getSeasonalWeights(weekOfYear) : SAFETY_INDEX_WEIGHTS;

  // Categories with no data are left out and the remaining weights rescaled to sum to 1,
  // so a failed download never nudges the score up or down.
  const categories = Object.keys(weights) as CategoryId[];
  const isAvailable = (category: CategoryId) => alerts[category].dataStatus !== 'unavailable';
  const availableWeight = categories.filter(isAvailable).reduce((sum, category) => sum + weights[category], 0);

  const breakdown = categories.map((category) => {
    const numericRisk = riskLevelToNumber(alerts[category].riskLevel);
    const weight = isAvailable(category) && availableWeight > 0 ? weights[category] / availableWeight : 0;

    return {
      category,
      riskLevel: alerts[category].riskLevel,
      numericRisk,
      contribution: numericRisk * weight,
      weight,
    };
  });

  // With no data at all, fall back to the scale minimum; the UI shows a "no data" state instead.
  const overallScore = availableWeight > 0 ? breakdown.reduce((sum, item) => sum + item.contribution, 0) : 1;
  let overallRisk = scoreToRiskLevel(overallScore);

  if (overallRisk === 'low' && breakdown.some((item) => item.weight > 0 && item.riskLevel === 'high')) {
    overallRisk = 'moderate';
  }

  return {
    overallScore: Number(overallScore.toFixed(2)),
    overallRisk,
    breakdown,
  };
}
