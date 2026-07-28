import { CATEGORY_META } from '../constants/config';
import { CategoryId, RiskLevel } from '../types/alerts';
import { toMosiDisplayScore } from './risk';

function parseDateValue(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalized =
    typeof value === 'number' || /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value));

  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

export function formatRiskLevel(riskLevel: RiskLevel) {
  if (riskLevel === 'high') {
    return 'High';
  }
  if (riskLevel === 'moderate') {
    return 'Moderate';
  }
  return 'Low';
}

export function formatCategory(category: CategoryId) {
  return CATEGORY_META[category].label;
}

export function formatMosiScore(score: number) {
  if (!Number.isFinite(score)) {
    return '0';
  }
  return `${toMosiDisplayScore(score)}`;
}

export function formatScore(score: number) {
  if (!Number.isFinite(score)) {
    return 'Unavailable';
  }
  return score.toFixed(2);
}

export function formatLastUpdated(timestamp?: string | number | Date | null) {
  const date = parseDateValue(timestamp);

  if (!date) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeMinutes(timestamp?: string | number | Date | null, nowMs = Date.now()) {
  const date = parseDateValue(timestamp);

  if (!date) {
    return 'Unavailable';
  }

  const minutes = Math.max(0, Math.round((nowMs - date.getTime()) / 60000));

  if (!Number.isFinite(minutes)) {
    return 'Unavailable';
  }

  if (minutes < 1) {
    return 'just now';
  }
  if (minutes === 1) {
    return '1 min ago';
  }
  if (minutes < 60) {
    return `${minutes} mins ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

export function formatDistanceKm(distanceKm?: number | null) {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return null;
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m from you`;
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km from you`;
}

export function formatTemperature(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return `${Math.round(value)}°`;
}

export function formatDomain(domain: string) {
  if (domain === 'vectorBorne') {
    return 'Vector-Borne';
  }
  if (domain === 'airQuality') {
    return 'Air Quality';
  }
  return domain
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
    .trim();
}
