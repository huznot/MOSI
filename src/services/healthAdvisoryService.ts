import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { AlertDetail, CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { cleanText, fetchText, withCacheFallback } from './serviceUtils';

const GENERIC_HEALTH_LINKS = new Set(['Health Protection', 'Health Protection Reports']);

const HEALTH_REGION_KEYWORDS: Record<RegionId, string[]> = {
  winnipeg: ['winnipeg', 'capital region'],
  southern: ['winkler', 'morden', 'portage', 'southern', 'carman', 'steinbach'],
  eastern: ['whiteshell', 'lac du bonnet', 'powerview', 'eastern', 'pinawa'],
  western: ['brandon', 'western', 'parkland', 'dauphin', 'swan river'],
  northern: ['northern', 'thompson', 'flin flon', 'the pas', 'churchill'],
};

type HealthHeadline = {
  id: string;
  title: string;
  url: string;
  riskLevel: RiskLevel;
  regionIds: RegionId[];
};

type HealthServiceResult = {
  byRegion: Record<RegionId, CategoryAlert>;
  details: AlertDetail[];
};

function isHealthAlertHeadline(text: string) {
  if (!text || GENERIC_HEALTH_LINKS.has(text)) {
    return false;
  }

  // Evergreen explainer pages ("Health Effects of Smoke Exposure...") are permanent links,
  // not active notices, and must not be counted as bulletins.
  if (/health effects|information|about |what is|how to|guide|resources|faq|fact sheet|reports?$/i.test(text)) {
    return false;
  }

  return /alert|advisory|outbreak|bulletin|emergency|exposure|recall/i.test(text);
}

function makeAbsoluteUrl(href: string) {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  return new URL(href, API_URLS.healthPublic).toString();
}

function inferHealthRegions(text: string): RegionId[] {
  const lowered = text.toLowerCase();
  const matches = (Object.keys(HEALTH_REGION_KEYWORDS) as RegionId[]).filter((regionId) =>
    HEALTH_REGION_KEYWORDS[regionId].some((keyword) => lowered.includes(keyword)),
  );

  return matches.length ? matches : ['winnipeg', 'southern', 'eastern', 'western', 'northern'];
}

export function getHealthRiskLevel(headline: string): RiskLevel {
  if (/emergency|critical/i.test(headline)) {
    return 'high';
  }
  if (/alert|advisory|outbreak|bulletin|recall/i.test(headline)) {
    return 'moderate';
  }
  return 'low';
}

function buildHealthDetail(headline: HealthHeadline): AlertDetail {
  return {
    id: headline.id,
    category: 'healthAdvisories',
    title: headline.title,
    summary: headline.title,
    description:
      'A public health bulletin or advisory headline is active on Manitoba Public Health pages. Read the issuing authority link for the full guidance and affected locations.',
    source: STRINGS.healthSource,
    sourceUrl: headline.url,
    authority: 'Province of Manitoba',
    geographicScope:
      headline.regionIds.length === 5 ? 'Province-wide or location not specified' : headline.regionIds.join(', '),
    riskLevel: headline.riskLevel,
    issuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    regionIds: headline.regionIds,
    recommendedActions: [
      'Read the full bulletin headline carefully to determine if your community or workplace is named.',
      'If the advisory involves a communicable disease, follow basic precautions: wash hands frequently, avoid close contact with symptomatic people.',
      'If a recall or exposure risk is mentioned, stop using the named product or avoid the affected location until cleared.',
      'People who are immunocompromised, elderly, pregnant, or have chronic conditions should be extra cautious and consult their physician if exposed.',
      'Monitor Manitoba Public Health announcements for updates and for when the advisory is officially lifted.',
    ],
  };
}

export async function fetchHealthAlerts(regions: ManitobaRegion[]) {
  const cacheKey = `${STORAGE_KEYS.health}:all`;
  const { data } = await withCacheFallback<HealthServiceResult>('health', cacheKey, async () => {
    const landingPage = await fetchText(API_URLS.healthPublic);
    const reportsPage = await fetchText(API_URLS.healthProtectionReports).catch(() => '');
    const headlines = [...`${landingPage}\n${reportsPage}`.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis)]
      .map((match, index) => ({
        id: `health:${index}`,
        href: makeAbsoluteUrl(match[1]),
        title: cleanText(match[2]),
      }))
      .filter((item) => isHealthAlertHeadline(item.title))
      .filter((item, index, values) => values.findIndex((value) => value.title === item.title) === index)
      .map<HealthHeadline>((item) => ({
        id: item.id,
        title: item.title,
        url: item.href,
        riskLevel: getHealthRiskLevel(item.title),
        regionIds: inferHealthRegions(item.title),
      }));

    const byRegion = regions.reduce<Record<RegionId, CategoryAlert>>((accumulator, region) => {
      const relevant = headlines.filter((headline) => headline.regionIds.includes(region.id));
      const topHeadline = relevant[0];
      const riskLevel = topHeadline?.riskLevel ?? 'low';
      accumulator[region.id] = {
        category: 'healthAdvisories',
        value: relevant.length,
        riskLevel,
        summary: relevant.length ? topHeadline.title : 'No active public health alerts detected',
        source: STRINGS.healthSource,
        sourceUrl: topHeadline?.url ?? API_URLS.healthPublic,
        lastUpdated: new Date().toISOString(),
        details: relevant.slice(0, 3).map((headline) => headline.title),
        dataStatus: 'live',
      };
      return accumulator;
    }, {} as Record<RegionId, CategoryAlert>);

    return {
      byRegion,
      details: headlines.map(buildHealthDetail),
    };
  });

  return data;
}
