import { AlertItem, AppDataset, DomainFilter, DomainId, PriorityItem, WeeklyRegionRecord } from './types';
import { clamp, getScenarioShift, getTrendDirection, labelFromScore, normalizeTrend, round } from '../utils/risk';
import { formatDomain, formatScore } from '../utils/format';

export const domainOrder: DomainId[] = ['air', 'water', 'vectors', 'heat'];

export function getCurrentWeekIndex(dataset: AppDataset) {
  return dataset.weeks.length - 1;
}

export function getRegionSeries(dataset: AppDataset, regionId: string) {
  return dataset.history[regionId];
}

export function getCurrentWeek(dataset: AppDataset, regionId: string) {
  return getRegionSeries(dataset, regionId)[getCurrentWeekIndex(dataset)];
}

export function getPreviousWeek(dataset: AppDataset, regionId: string) {
  return getRegionSeries(dataset, regionId)[getCurrentWeekIndex(dataset) - 1];
}

export function getDomainTrend(current: WeeklyRegionRecord, previous: WeeklyRegionRecord, domain: DomainId) {
  return current.domains[domain].score - previous.domains[domain].score;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

export function getOverviewTiles(dataset: AppDataset) {
  return domainOrder.map((domain) => {
    const scores = dataset.regions.map((region) => getCurrentWeek(dataset, region.id).domains[domain].score);
    const trends = dataset.regions.map((region) =>
      getDomainTrend(getCurrentWeek(dataset, region.id), getPreviousWeek(dataset, region.id), domain),
    );
    const score = average(scores);
    const trend = average(trends);
    return {
      domain,
      score,
      trend,
      label: labelFromScore(score),
      direction: getTrendDirection(trend),
    };
  });
}

export function getHighestRiskDomain(dataset: AppDataset) {
  return [...getOverviewTiles(dataset)].sort((left, right) => right.score - left.score)[0];
}

export function buildPriorityBriefing(dataset: AppDataset) {
  const records = dataset.regions.flatMap((region) => {
    const current = getCurrentWeek(dataset, region.id);
    const previous = getPreviousWeek(dataset, region.id);
    return domainOrder.map((domain) => {
      const score = current.domains[domain].score;
      const trend = getDomainTrend(current, previous, domain);
      const weight = 0.7 * score + 0.3 * normalizeTrend(trend);
      const tier = score >= 0.7 || trend >= 0.15 ? 'Tier 1' : score >= 0.4 ? 'Tier 2' : 'Tier 3';
      return {
        domain,
        region: region.name,
        score,
        trend,
        tier,
        share: 0,
        weight,
      } as PriorityItem;
    });
  });

  const ranked = records.sort((left, right) => right.weight - left.weight).slice(0, 5);
  const totalWeight = ranked.reduce((sum, item) => sum + item.weight, 0) || 1;
  ranked.forEach((item) => {
    item.share = (item.weight / totalWeight) * 100;
  });

  const topHotspot = [...records].sort((left, right) => right.score - left.score)[0];
  const fastestRising = [...records].sort((left, right) => right.trend - left.trend)[0];

  return {
    topHotspot,
    fastestRising,
    ranked,
  };
}

export function getActionsForDomain(domain: DomainId) {
  const actionMap: Record<DomainId, string[]> = {
    air: [
      'Limit hard outdoor activity this afternoon.',
      'Keep rescue inhalers and masks easy to reach.',
      'Check indoor air filters in schools and care spaces.',
      'Move outdoor events if smoke thickens.',
    ],
    water: [
      'Use boiled or bottled water for drinking.',
      'Post clear notices in shared buildings.',
      'Watch for runoff after heavy rainfall.',
      'Flag care homes and daycares first.',
    ],
    vectors: [
      'Use repellent in grass and brush.',
      'Do a same-day tick check after outdoor work.',
      'Drain standing water near homes and yards.',
      'Push local reminders before weekend travel.',
    ],
    heat: [
      'Check cooling and warming spaces early.',
      'Call older adults and outdoor workers first.',
      'Shift strenuous activity away from peak heat or deep cold.',
      'Carry water and add warm layers when conditions flip fast.',
    ],
  };

  return actionMap[domain];
}

export function buildAlerts(dataset: AppDataset, filter: DomainFilter) {
  const items: AlertItem[] = [];

  dataset.regions.forEach((region) => {
    const current = getCurrentWeek(dataset, region.id);
    const previous = getPreviousWeek(dataset, region.id);

    domainOrder.forEach((domain) => {
      if (filter !== 'all' && filter !== domain) {
        return;
      }

      const currentRisk = current.domains[domain];
      const trend = getDomainTrend(current, previous, domain);
      const rising = trend >= 0.08;
      const severe = currentRisk.score >= 0.7;
      const advisory = domain === 'water' && currentRisk.features.advisory_flag === 1;

      if (!severe && !rising && !advisory) {
        return;
      }

      const title =
        domain === 'air'
          ? `${currentRisk.label} smoke risk in ${region.name}.`
          : domain === 'water'
            ? `Water advisory risk is ${rising ? 'rising' : currentRisk.label.toLowerCase()} in ${region.name}.`
            : domain === 'vectors'
              ? `Vector risk is building in ${region.name}.`
              : `Extreme temperature risk is active in ${region.name}.`;

      const explanation =
        domain === 'air'
          ? 'Smoke and fine particle proxies are elevated this week.'
          : domain === 'water'
            ? advisory
              ? 'Runoff and turbidity signals crossed the advisory rule.'
              : 'Recent runoff is pushing water risk upward.'
            : domain === 'vectors'
              ? 'Warmer weeks and moisture are improving vector conditions.'
              : 'Temperature stress is above the seasonal norm this week.';

      items.push({
        id: `${region.id}-${domain}`,
        domain,
        region: region.name,
        title,
        severity: currentRisk.label,
        timeLabel: 'Updated this week',
        explanation,
        actions: getActionsForDomain(domain).slice(0, 3),
        score: currentRisk.score,
        trend,
      });
    });
  });

  return items.sort((left, right) => right.score + right.trend - (left.score + left.trend));
}

export function getRegionBreakdown(dataset: AppDataset, regionId: string) {
  const current = getCurrentWeek(dataset, regionId);
  const previous = getPreviousWeek(dataset, regionId);
  const region = dataset.regions.find((item) => item.id === regionId);

  const breakdown = domainOrder.map((domain) => {
    const currentRisk = current.domains[domain];
    const trend = getDomainTrend(current, previous, domain);
    return {
      domain,
      score: currentRisk.score,
      label: currentRisk.label,
      trend,
      direction: getTrendDirection(trend),
    };
  });

  const focus = [...breakdown].sort((left, right) => right.score - left.score)[0];
  const sparklineDomain = focus.domain;
  const sparkline = getRegionSeries(dataset, regionId)
    .slice(-8)
    .map((record) => record.domains[sparklineDomain].score);

  return {
    region,
    breakdown,
    actions: getActionsForDomain(focus.domain),
    sparklineDomain,
    sparkline,
  };
}

export function getMapPoints(dataset: AppDataset, filter: DomainFilter) {
  return dataset.regions.map((region) => {
    const current = getCurrentWeek(dataset, region.id);
    const previous = getPreviousWeek(dataset, region.id);

    if (filter === 'all') {
      const scores = domainOrder.map((domain) => current.domains[domain].score);
      const maxScore = Math.max(...scores);
      const domain = domainOrder[scores.findIndex((item) => item === maxScore)];
      return {
        ...region,
        activeDomain: domain,
        score: maxScore,
        label: labelFromScore(maxScore),
        trend: getDomainTrend(current, previous, domain),
      };
    }

    return {
      ...region,
      activeDomain: filter,
      score: current.domains[filter].score,
      label: current.domains[filter].label,
      trend: getDomainTrend(current, previous, filter),
    };
  });
}

export function getDomainInsight(dataset: AppDataset, domain: DomainId, scenarioDelta: number) {
  const shift = getScenarioShift(domain, scenarioDelta);
  const recentWeeks = dataset.weeks.slice(-24);
  const provinceSeries = recentWeeks.map((_, index) => {
    const absoluteIndex = dataset.weeks.length - 24 + index;
    const scores = dataset.regions.map((region) => clamp(dataset.history[region.id][absoluteIndex].domains[domain].score + shift));
    const baselines = dataset.regions.map((region) => clamp(dataset.history[region.id][absoluteIndex].domains[domain].baseline + shift * 0.55));
    return {
      week: index + 1,
      label: dataset.weeks[absoluteIndex],
      score: average(scores),
      baseline: average(baselines),
    };
  });

  const last = provinceSeries[provinceSeries.length - 1];
  const prev = provinceSeries[provinceSeries.length - 2];
  const recentAverage = average(provinceSeries.slice(-6).map((item) => item.score));
  const trend = last.score - prev.score;

  const forecast = Array.from({ length: 4 }, (_, step) => {
    const baseline = clamp(last.baseline + Math.sin((step + 1) / 4) * 0.04 + shift * 0.55);
    const model = clamp(0.56 * baseline + 0.3 * recentAverage + 0.14 * clamp(trend + 0.15));
    return {
      week: provinceSeries.length + step + 1,
      baseline,
      score: model,
    };
  });

  const currentFeatures = dataset.regions
    .map((region) => getCurrentWeek(dataset, region.id).domains[domain].features)
    .reduce<Record<string, number>>((accumulator, features) => {
      Object.entries(features).forEach(([key, value]) => {
        accumulator[key] = (accumulator[key] ?? 0) + value;
      });
      return accumulator;
    }, {});

  const driverText = Object.entries(currentFeatures)
    .map(([key, value]) => ({ key, value: value / dataset.regions.length }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map(({ key, value }) => {
      const label =
        key === 'smoke_index'
          ? 'Smoke pressure remains elevated.'
          : key === 'pm25_proxy'
            ? 'Fine particle load is still above normal.'
            : key === 'wind'
              ? 'Lighter wind is trapping risk in place.'
              : key === 'turbidity_proxy'
                ? 'Water clarity is under strain.'
                : key === 'rainfall_runoff_proxy'
                  ? 'Runoff is still feeding into water systems.'
                  : key === 'advisory_flag'
                    ? 'Rule-based advisory triggers are active in some regions.'
                    : key === 'temp'
                      ? 'Warmer conditions are supporting activity.'
                      : key === 'precipitation'
                        ? 'Recent moisture is helping risk build.'
                        : key === 'vegetation_proxy'
                          ? 'Vegetation and habitat conditions are favorable.'
                          : key === 'temp_anomaly'
                            ? 'Temperature departures from normal are driving stress.'
                            : key === 'humidex_proxy'
                              ? 'Humidity is making hot periods harder on the body.'
                              : 'Cold snaps are adding extra strain.';
      return {
        label,
        value: round(value * 100, 0),
      };
    });

  return {
    currentScore: last.score,
    currentBaseline: last.baseline,
    delta: shift,
    trend,
    history: provinceSeries,
    forecast,
    drivers: driverText,
  };
}

export function getInsightsSummary(dataset: AppDataset, scenarioDelta: number) {
  return domainOrder.map((domain) => {
    const insight = getDomainInsight(dataset, domain, scenarioDelta);
    const records = dataset.regions.map((region) => ({
      region: region.name,
      score: clamp(getCurrentWeek(dataset, region.id).domains[domain].score + getScenarioShift(domain, scenarioDelta)),
    }));
    const topRegion = [...records].sort((left, right) => right.score - left.score)[0];
    return {
      domain,
      score: insight.currentScore,
      label: labelFromScore(insight.currentScore),
      delta: insight.delta,
      topRegion,
    };
  });
}

export function buildScenarioLine(domain: DomainId, delta: number) {
  if (domain !== 'heat' && domain !== 'vectors') {
    return 'Scenario only affects heat and vector models.';
  }
  return `Model shifts by ${formatScore(getScenarioShift(domain, delta))} points under +${delta}C.`;
}

export function getDomainHeadline(domain: DomainId, region: string) {
  return `${formatDomain(domain)} pressure is highest in ${region}.`;
}
