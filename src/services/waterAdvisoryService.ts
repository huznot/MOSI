import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { AlertDetail, CategoryAlert, ManitobaRegion, RegionCoordinate, RegionId } from '../types/alerts';
import { SubRegion } from '../data/manitobaSubRegions';
import { pointInPolygon } from '../data/manitobaGeometry';
import { fetchJson, postJson, readCache, withCacheFallback, writeCache } from './serviceUtils';
import { getDistanceKm, getRegionFromCoordinates } from './locationService';

type ArcgisFeatureResponse = {
  features: Array<{
    attributes: Record<string, string | number | null>;
    geometry?: { x?: number; y?: number };
  }>;
};

export type WaterAdvisory = {
  id: string;
  systemName: string;
  issueDate: number | string | null;
  advisoryType: string;
  scope: 'pws' | 'spws' | 'other';
  regionId: RegionId;
  coordinates: RegionCoordinate;
  populationRange: string | null;
  advisoryCategory: string | null;
  operatingPeriod: string | null;
  impactRadiusMetres: number;
  impactPolygon: RegionCoordinate[] | null;
};

export type WaterServiceResult = {
  byRegion: Record<RegionId, CategoryAlert>;
  details: AlertDetail[];
  mapDetails: AlertDetail[];
  enrichmentCandidates: WaterAdvisory[];
};

type WaterAreaShape = {
  coordinates: RegionCoordinate;
  impactRadiusMetres?: number | null;
  impactPolygon?: readonly RegionCoordinate[] | null;
};

type OverpassElement = {
  type: 'way' | 'relation';
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

const EXACT_SHAPE_LOOKUP_LIMIT = 120;
const EXACT_SHAPE_BATCH_SIZE = 18;
const MANITOBA_TIME_ZONE = 'America/Winnipeg';
const MANITOBA_MONTH_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANITOBA_TIME_ZONE,
  month: 'numeric',
});
const MAPLE_GROVE_PARK_POLYGON: RegionCoordinate[] = [
  { latitude: 49.7939601, longitude: -97.1152299 },
  { latitude: 49.7926674, longitude: -97.1157234 },
  { latitude: 49.7902049, longitude: -97.1230369 },
  { latitude: 49.7902833, longitude: -97.1231074 },
  { latitude: 49.7901944, longitude: -97.1233462 },
  { latitude: 49.79028, longitude: -97.1234289 },
  { latitude: 49.7862335, longitude: -97.1352249 },
  { latitude: 49.7863592, longitude: -97.1353026 },
  { latitude: 49.7869209, longitude: -97.1352545 },
  { latitude: 49.787796, longitude: -97.1352581 },
  { latitude: 49.7881226, longitude: -97.1351775 },
  { latitude: 49.7885426, longitude: -97.1349484 },
  { latitude: 49.7889639, longitude: -97.1346637 },
  { latitude: 49.7895672, longitude: -97.1343047 },
  { latitude: 49.7903887, longitude: -97.1334554 },
  { latitude: 49.7920241, longitude: -97.1321046 },
  { latitude: 49.7930567, longitude: -97.131503 },
  { latitude: 49.7934698, longitude: -97.1311759 },
  { latitude: 49.7939445, longitude: -97.1309217 },
  { latitude: 49.7951388, longitude: -97.1303563 },
  { latitude: 49.7955041, longitude: -97.1301522 },
  { latitude: 49.7959533, longitude: -97.129827 },
  { latitude: 49.7964866, longitude: -97.1293667 },
  { latitude: 49.7966729, longitude: -97.1290976 },
  { latitude: 49.7968806, longitude: -97.1286762 },
  { latitude: 49.7970624, longitude: -97.1281977 },
  { latitude: 49.797133, longitude: -97.1278529 },
  { latitude: 49.7971312, longitude: -97.1275183 },
  { latitude: 49.7970922, longitude: -97.1272375 },
  { latitude: 49.7969585, longitude: -97.1267427 },
  { latitude: 49.7966188, longitude: -97.1261815 },
  { latitude: 49.7959215, longitude: -97.1254625 },
  { latitude: 49.7954153, longitude: -97.1250879 },
  { latitude: 49.795252, longitude: -97.1249817 },
  { latitude: 49.7942863, longitude: -97.1243543 },
  { latitude: 49.7941179, longitude: -97.1241984 },
  { latitude: 49.7939495, longitude: -97.1240361 },
  { latitude: 49.793431, longitude: -97.1232191 },
  { latitude: 49.7931622, longitude: -97.1228143 },
  { latitude: 49.7929967, longitude: -97.1224977 },
  { latitude: 49.7928216, longitude: -97.1219734 },
  { latitude: 49.7927445, longitude: -97.1217508 },
  { latitude: 49.792703, longitude: -97.1217427 },
  { latitude: 49.7926743, longitude: -97.1216558 },
  { latitude: 49.7926398, longitude: -97.1215509 },
  { latitude: 49.7926779, longitude: -97.1215214 },
  { latitude: 49.7926147, longitude: -97.1212519 },
  { latitude: 49.7925419, longitude: -97.1208723 },
  { latitude: 49.7924831, longitude: -97.1204365 },
  { latitude: 49.792445, longitude: -97.1196908 },
  { latitude: 49.7924753, longitude: -97.1192898 },
  { latitude: 49.7925549, longitude: -97.1189237 },
  { latitude: 49.7925402, longitude: -97.1188245 },
  { latitude: 49.7926857, longitude: -97.1182639 },
  { latitude: 49.7928694, longitude: -97.1177015 },
  { latitude: 49.7930475, longitude: -97.117309 },
  { latitude: 49.793141, longitude: -97.11701 },
  { latitude: 49.7934718, longitude: -97.1164507 },
  { latitude: 49.7938864, longitude: -97.1160135 },
  { latitude: 49.7939696, longitude: -97.1160001 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toOptionalText(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function toSortableTime(value?: string | number | null) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getManitobaMonth(date: Date) {
  try {
    const month = Number(MANITOBA_MONTH_FORMATTER.format(date));
    return Number.isFinite(month) ? month : date.getMonth() + 1;
  } catch {
    return date.getMonth() + 1;
  }
}

function isWithinSeasonalWaterDisplayWindow(date = new Date()) {
  const month = getManitobaMonth(date);
  return month >= 5 && month <= 10;
}

function isSeasonalWaterAdvisory(advisory: Pick<WaterAdvisory, 'operatingPeriod'>) {
  return /seasonal/i.test(advisory.operatingPeriod ?? '');
}

function shouldDisplayWaterAdvisory(
  advisory: Pick<WaterAdvisory, 'operatingPeriod'>,
  seasonalDisplayWindowOpen = isWithinSeasonalWaterDisplayWindow(),
) {
  return seasonalDisplayWindowOpen || !isSeasonalWaterAdvisory(advisory);
}

function parsePopulationUpperBound(populationRange: string | null) {
  if (!populationRange) {
    return null;
  }

  const values = [...populationRange.matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replace(/,/g, '')));
  if (!values.length) {
    return null;
  }

  if (/\+/.test(populationRange)) {
    return values[values.length - 1] * 1.5;
  }

  return values[values.length - 1];
}

function looksLikeSiteBasedWaterSystem(systemName: string, advisoryCategory: string | null) {
  return (
    /recreational/i.test(advisoryCategory ?? '') ||
    /campground|resort|beach|park|lodge|golf|rv|camp|club/i.test(systemName)
  );
}

function inferPwsImpactRadiusMetres(
  systemName: string,
  populationRange: string | null,
  advisoryCategory: string | null,
  operatingPeriod: string | null,
) {
  const populationUpperBound = parsePopulationUpperBound(populationRange);
  const isMunicipalSystem = /municipal|community/i.test(advisoryCategory ?? '');
  const isSiteLikePws = looksLikeSiteBasedWaterSystem(systemName, advisoryCategory);
  const isSmallNetwork =
    /small cooperatively|privately owned/i.test(advisoryCategory ?? '') ||
    /co-?op|colony|court|estates?|mobile home|trailer|subdivision/i.test(systemName);

  let radiusMetres: number;

  if (isSiteLikePws) {
    radiusMetres =
      populationUpperBound !== null && populationUpperBound <= 100
        ? 280
        : populationUpperBound !== null && populationUpperBound <= 500
          ? 420
          : 650;
  } else if (populationUpperBound === null) {
    radiusMetres = isMunicipalSystem ? 1800 : 850;
  } else if (populationUpperBound <= 100) {
    radiusMetres = 550;
  } else if (populationUpperBound <= 500) {
    radiusMetres = 900;
  } else if (populationUpperBound <= 1000) {
    radiusMetres = 1300;
  } else if (populationUpperBound <= 5000) {
    radiusMetres = 2200;
  } else if (populationUpperBound <= 10000) {
    radiusMetres = 3200;
  } else {
    radiusMetres = 4300;
  }

  if (isMunicipalSystem && !isSiteLikePws) {
    radiusMetres *= 1.15;
  }

  if (isSmallNetwork && !isSiteLikePws) {
    radiusMetres *= 0.8;
  }

  if (/seasonal/i.test(operatingPeriod ?? '')) {
    radiusMetres *= 0.88;
  }

  return Math.round(clamp(radiusMetres, 250, 6500));
}

function inferSpwsImpactRadiusMetres(
  systemName: string,
  advisoryCategory: string | null,
  operatingPeriod: string | null,
  scope: WaterAdvisory['scope'],
) {
  const normalizedName = systemName.toLowerCase();
  const normalizedCategory = (advisoryCategory ?? '').toLowerCase();
  const isFoodHandling = /food handling/.test(normalizedCategory);
  const isInstitutional = /hospital|school|care facilit/.test(normalizedCategory);
  const isRecreation = /recreational|campground|resort/.test(normalizedCategory);

  let radiusMetres = scope === 'other' ? 80 : 70;

  if (/very small residential/i.test(advisoryCategory ?? '')) {
    radiusMetres = 55;
  } else if (
    isFoodHandling ||
    /restaurant|pizza|cafe|coffee|bar\b|grill|deli|subway|tim horton|diner|store|grocery|market|shop|station|petroleum|foods?\b|mart\b/i.test(
      normalizedName,
    )
  ) {
    radiusMetres = 45;
  } else if (
    isInstitutional ||
    /school|hospital|health|care|centre|center|campus|college|university|airport|arena|complex|plant|mine|mill/i.test(
      normalizedName,
    )
  ) {
    radiusMetres = /campus|university|college|airport|complex|plant|mine|mill/i.test(normalizedName) ? 170 : 130;
  } else if (
    isRecreation ||
    /hotel|inn|lodge|resort|campground|park|golf|club|recreation|camp|cabins?/i.test(normalizedName)
  ) {
    radiusMetres =
      /campground|park|golf|recreation|camp|club/i.test(normalizedName)
        ? 190
        : 145;
  } else if (/museum|church|hall|dock|station|fire base|office|general store|learning centre/i.test(normalizedName)) {
    radiusMetres = 85;
  } else if (/trailer|subdivision|manor|court|apartments?|homes?|residence/i.test(normalizedName)) {
    radiusMetres = 70;
  }

  if (/seasonal/i.test(operatingPeriod ?? '')) {
    radiusMetres *= 0.92;
  }

  return Math.round(clamp(radiusMetres, 35, 260));
}

function inferWaterImpactRadiusMetres(advisory: Pick<
  WaterAdvisory,
  'scope' | 'systemName' | 'populationRange' | 'advisoryCategory' | 'operatingPeriod'
>) {
  return advisory.scope === 'pws'
    ? inferPwsImpactRadiusMetres(
        advisory.systemName,
        advisory.populationRange,
        advisory.advisoryCategory,
        advisory.operatingPeriod,
      )
    : inferSpwsImpactRadiusMetres(
        advisory.systemName,
        advisory.advisoryCategory,
        advisory.operatingPeriod,
        advisory.scope,
      );
}

function classifyWaterSiteKind(
  systemName: string,
  advisoryCategory: string | null,
  scope: WaterAdvisory['scope'],
) {
  const normalizedName = systemName.toLowerCase();
  const normalizedCategory = (advisoryCategory ?? '').toLowerCase();

  if (/very small residential/i.test(normalizedCategory) || /trailer|subdivision|manor|court|apartments?|homes?|residence/i.test(normalizedName)) {
    return 'residential' as const;
  }

  if (
    /food handling/.test(normalizedCategory) ||
    /restaurant|pizza|cafe|coffee|bar\b|grill|deli|subway|tim horton|diner|store|grocery|market|shop|station|petroleum|foods?\b|mart\b|fuel/i.test(normalizedName)
  ) {
    return 'food' as const;
  }

  if (
    /hospital|school|care facilit/i.test(normalizedCategory) ||
    /school|hospital|health|care|centre|center|campus|college|university|airport|arena|complex|plant|mine|mill|learning centre/i.test(normalizedName)
  ) {
    return 'institutional' as const;
  }

  if (
    /recreational|campground|resort/i.test(normalizedCategory) ||
    /hotel|inn|lodge|resort|campground|park|golf|club|recreation|camp|cabins?|dock/i.test(normalizedName) ||
    (scope === 'pws' && looksLikeSiteBasedWaterSystem(systemName, advisoryCategory))
  ) {
    return 'recreation' as const;
  }

  return 'generic' as const;
}

function normalizeShapePolygon(polygon: readonly RegionCoordinate[]) {
  const normalized = polygon.filter(
    (point, index, all) =>
      index === 0 ||
      point.latitude !== all[index - 1].latitude ||
      point.longitude !== all[index - 1].longitude,
  );

  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first.latitude === last.latitude && first.longitude === last.longitude) {
      normalized.pop();
    }
  }

  return normalized.length >= 3 ? normalized : null;
}

function getPolygonCentroid(polygon: readonly RegionCoordinate[]) {
  const { latitude, longitude } = polygon.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: latitude / polygon.length,
    longitude: longitude / polygon.length,
  };
}

function getPolygonSpanMetres(polygon: readonly RegionCoordinate[]) {
  const bounds = polygon.reduce(
    (accumulator, point) => ({
      minLat: Math.min(accumulator.minLat, point.latitude),
      maxLat: Math.max(accumulator.maxLat, point.latitude),
      minLon: Math.min(accumulator.minLon, point.longitude),
      maxLon: Math.max(accumulator.maxLon, point.longitude),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
    },
  );

  return getDistanceKm(bounds.minLat, bounds.minLon, bounds.maxLat, bounds.maxLon) * 1000;
}

function normalizeSearchTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(spws|pws|inc|corp|corporation|ltd|limited|company|co|water|system)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function getManualWaterImpactPolygonOverride(advisory: Pick<WaterAdvisory, 'systemName'>) {
  const normalizedName = advisory.systemName.toLowerCase();

  if (/maple grove rugby park bar/.test(normalizedName)) {
    return MAPLE_GROVE_PARK_POLYGON;
  }

  if (/iberville colony/.test(normalizedName)) {
    return null;
  }

  return undefined;
}

export function getWaterSiteIdentity(advisory: Pick<WaterAdvisory, 'coordinates' | 'systemName'>) {
  const normalizedName = normalizeSearchTokens(advisory.systemName).slice(0, 10).join('-') || 'site';
  return `${advisory.coordinates.latitude.toFixed(6)}:${advisory.coordinates.longitude.toFixed(6)}:${normalizedName}`;
}

function getNameOverlapScore(advisoryName: string, candidateLabel: string | null) {
  if (!candidateLabel) {
    return 0;
  }

  const advisoryTokens = new Set(normalizeSearchTokens(advisoryName));
  const candidateTokens = new Set(normalizeSearchTokens(candidateLabel));

  let overlap = 0;
  advisoryTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap * 18;
}

function getOverpassSearchRadiusMetres(advisory: WaterAdvisory) {
  const siteKind = classifyWaterSiteKind(advisory.systemName, advisory.advisoryCategory, advisory.scope);
  if (siteKind === 'food' || siteKind === 'residential') {
    return 70;
  }
  if (siteKind === 'institutional') {
    return 130;
  }
  if (siteKind === 'recreation') {
    return 320;
  }
  return advisory.scope === 'pws' ? 200 : 110;
}

function buildOverpassShapeQuery(advisory: WaterAdvisory) {
  const radius = getOverpassSearchRadiusMetres(advisory);
  const buildingRadius = Math.max(40, Math.min(radius, 90));
  const { latitude, longitude } = advisory.coordinates;

  return [
    `way(around:${buildingRadius},${latitude},${longitude})[building];`,
    `relation(around:${buildingRadius},${latitude},${longitude})[building];`,
    `way(around:${radius},${latitude},${longitude})[amenity];`,
    `relation(around:${radius},${latitude},${longitude})[amenity];`,
    `way(around:${radius},${latitude},${longitude})[shop];`,
    `relation(around:${radius},${latitude},${longitude})[shop];`,
    `way(around:${radius},${latitude},${longitude})[tourism];`,
    `relation(around:${radius},${latitude},${longitude})[tourism];`,
    `way(around:${radius},${latitude},${longitude})[leisure];`,
    `relation(around:${radius},${latitude},${longitude})[leisure];`,
  ].join('');
}

function buildOverpassShapeBatchQuery(advisories: readonly WaterAdvisory[]) {
  return `[out:json][timeout:40];(${advisories.map((advisory) => buildOverpassShapeQuery(advisory)).join('')});out geom;`;
}

function getOverpassCandidateLabel(element: OverpassElement) {
  return element.tags?.name ?? element.tags?.operator ?? element.tags?.brand ?? null;
}

function getOverpassCandidatePolygon(element: OverpassElement) {
  if (element.geometry?.length) {
    return normalizeShapePolygon(
      element.geometry.map((point) => ({
        latitude: point.lat,
        longitude: point.lon,
      })),
    );
  }

  if (element.type === 'relation' && element.members?.length) {
    const outerWay = element.members.find((m) => m.role === 'outer' && m.geometry?.length);
    if (outerWay?.geometry?.length) {
      return normalizeShapePolygon(
        outerWay.geometry.map((point) => ({
          latitude: point.lat,
          longitude: point.lon,
        })),
      );
    }
  }

  return null;
}

function scoreOverpassCandidate(advisory: WaterAdvisory, element: OverpassElement, polygon: readonly RegionCoordinate[]) {
  const centroid = getPolygonCentroid(polygon);
  const distanceMetres = getDistanceKm(
    advisory.coordinates.latitude,
    advisory.coordinates.longitude,
    centroid.latitude,
    centroid.longitude,
  ) * 1000;
  const spanMetres = getPolygonSpanMetres(polygon);
  const label = getOverpassCandidateLabel(element);
  const siteKind = classifyWaterSiteKind(advisory.systemName, advisory.advisoryCategory, advisory.scope);
  const tags = element.tags ?? {};
  const containsPoint = pointInPolygon(advisory.coordinates.latitude, advisory.coordinates.longitude, polygon);
  const isBuilding = Boolean(tags.building);
  const isShop = Boolean(tags.shop);
  const isFoodPlace = /restaurant|cafe|fast_food|bar|pub|fuel/i.test(tags.amenity ?? '') || isShop;
  const isInstitutionalPlace = /school|hospital|college|university|kindergarten|community_centre/i.test(tags.amenity ?? '');
  const isRecreationPlace = /park|pitch|golf_course|sports_centre|playground/i.test(tags.leisure ?? '') || /camp_site|resort|hotel|motel|attraction|museum/i.test(tags.tourism ?? '');
  const nameOverlapScore = getNameOverlapScore(advisory.systemName, label);
  const strongNamedRecreationMatch = isRecreationPlace && containsPoint && nameOverlapScore >= 36;

  let score = containsPoint ? 90 : Math.max(0, 60 - distanceMetres * 0.6);
  score += nameOverlapScore;

  if (siteKind === 'food') {
    if (isBuilding) score += 40;
    if (isFoodPlace) score += 32;
    if (strongNamedRecreationMatch) score += 38;
    if (!isBuilding && !isFoodPlace && !strongNamedRecreationMatch) score -= 75;
    if (spanMetres > 120 && !strongNamedRecreationMatch) score -= 45;
  } else if (siteKind === 'residential') {
    if (isBuilding) score += 42;
    if (!isBuilding) score -= 60;
    if (spanMetres > 90) score -= 35;
  } else if (siteKind === 'institutional') {
    if (isBuilding) score += 34;
    if (isInstitutionalPlace) score += 30;
    if (!isBuilding && !isInstitutionalPlace) score -= 28;
    if (spanMetres > 280) score -= 18;
  } else if (siteKind === 'recreation') {
    if (isRecreationPlace) score += 44;
    if (isBuilding) score += 18;
  } else if (isBuilding) {
    score += 18;
  }

  return score;
}

function isExactShapeEligible(advisory: WaterAdvisory) {
  if (getManualWaterImpactPolygonOverride(advisory) !== undefined) {
    return false;
  }

  if (advisory.scope !== 'pws') {
    return true;
  }

  return !/municipal|community/i.test(advisory.advisoryCategory ?? '');
}

function getShapeCacheKey(advisory: WaterAdvisory) {
  return `${STORAGE_KEYS.waterShapes}:v3:${getWaterSiteIdentity(advisory)}`;
}

async function readCachedExactWaterImpactPolygon(advisory: WaterAdvisory) {
  const manualOverride = getManualWaterImpactPolygonOverride(advisory);
  if (manualOverride !== undefined) {
    return manualOverride;
  }

  const cached = await readCache<RegionCoordinate[] | null>(getShapeCacheKey(advisory));
  return cached ? cached.data : undefined;
}

async function resolveExactWaterImpactPolygon(advisory: WaterAdvisory) {
  const cacheKey = getShapeCacheKey(advisory);
  const cached = await readCachedExactWaterImpactPolygon(advisory);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await postJson<OverpassResponse>(
      API_URLS.osmOverpass,
      `[out:json][timeout:25];(${buildOverpassShapeQuery(advisory)});out geom;`,
    );

    const candidates = (response.elements ?? [])
      .map((element) => {
        const polygon = getOverpassCandidatePolygon(element);
        if (!polygon) {
          return null;
        }

        return {
          polygon,
          score: scoreOverpassCandidate(advisory, element, polygon),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right!.score - left!.score);

    const best = candidates[0];
    const polygon = best && best.score >= 40 ? best.polygon : null;
    await writeCache(cacheKey, polygon);
    return polygon;
  } catch {
    return null;
  }
}

function selectBestExactWaterImpactPolygon(advisory: WaterAdvisory, elements: readonly OverpassElement[]) {
  const candidates = elements
    .map((element) => {
      const polygon = getOverpassCandidatePolygon(element);
      if (!polygon) {
        return null;
      }

      return {
        polygon,
        score: scoreOverpassCandidate(advisory, element, polygon),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right!.score - left!.score);

  const best = candidates[0];
  return best && best.score >= 40 ? best.polygon : null;
}

async function resolveExactWaterImpactPolygons(advisories: readonly WaterAdvisory[]) {
  const polygonsBySite = new Map<string, RegionCoordinate[] | null>();

  for (let index = 0; index < advisories.length; index += EXACT_SHAPE_BATCH_SIZE) {
    const batch = advisories.slice(index, index + EXACT_SHAPE_BATCH_SIZE);

    try {
      const response = await postJson<OverpassResponse>(
        API_URLS.osmOverpass,
        buildOverpassShapeBatchQuery(batch),
      );
      const elements = response.elements ?? [];

      batch.forEach((advisory) => {
        polygonsBySite.set(getWaterSiteIdentity(advisory), selectBestExactWaterImpactPolygon(advisory, elements));
      });
    } catch {

    }
  }

  return polygonsBySite;
}

function toProjectedKm(origin: RegionCoordinate, point: RegionCoordinate) {
  const averageLatitudeRadians = (((origin.latitude + point.latitude) / 2) * Math.PI) / 180;
  const x = (point.longitude - origin.longitude) * 111.32 * Math.cos(averageLatitudeRadians);
  const y = (point.latitude - origin.latitude) * 110.57;

  return { x, y };
}

function distancePointToSegmentKm(point: RegionCoordinate, start: RegionCoordinate, end: RegionCoordinate) {
  const projectedStart = toProjectedKm(point, start);
  const projectedEnd = toProjectedKm(point, end);
  const deltaX = projectedEnd.x - projectedStart.x;
  const deltaY = projectedEnd.y - projectedStart.y;
  const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;

  if (segmentLengthSquared === 0) {
    return Math.hypot(projectedStart.x, projectedStart.y);
  }

  const projection = clamp(-(projectedStart.x * deltaX + projectedStart.y * deltaY) / segmentLengthSquared, 0, 1);
  const nearestX = projectedStart.x + deltaX * projection;
  const nearestY = projectedStart.y + deltaY * projection;

  return Math.hypot(nearestX, nearestY);
}

function getWaterImpactRadiusKm(shape: WaterAreaShape) {
  return (shape.impactRadiusMetres ?? 0) / 1000;
}

function dedupeWaterAdvisoriesBySite(advisories: readonly WaterAdvisory[]) {
  const groups = new Map<string, WaterAdvisory[]>();

  advisories.forEach((advisory) => {
    const siteKey = getWaterSiteIdentity(advisory);
    const current = groups.get(siteKey);
    if (current) {
      current.push(advisory);
      return;
    }
    groups.set(siteKey, [advisory]);
  });

  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((left, right) => {
      const leftPriority = left.scope === 'pws' ? 0 : left.impactPolygon?.length ? 1 : 2;
      const rightPriority = right.scope === 'pws' ? 0 : right.impactPolygon?.length ? 1 : 2;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return toSortableTime(right.issueDate) - toSortableTime(left.issueDate);
    });

    return sorted[0];
  });
}

export function waterAreaContainsPoint(shape: WaterAreaShape, point: RegionCoordinate) {
  if (shape.impactPolygon?.length) {
    return pointInPolygon(point.latitude, point.longitude, shape.impactPolygon);
  }

  return getDistanceKm(
    point.latitude,
    point.longitude,
    shape.coordinates.latitude,
    shape.coordinates.longitude,
  ) <= getWaterImpactRadiusKm(shape);
}

export function waterAreaIntersectsPolygon(shape: WaterAreaShape, polygon: readonly RegionCoordinate[]) {
  if (!polygon.length) {
    return false;
  }

  if (shape.impactPolygon?.length) {
    return (
      shape.impactPolygon.some((vertex) => pointInPolygon(vertex.latitude, vertex.longitude, polygon)) ||
      polygon.some((vertex) => pointInPolygon(vertex.latitude, vertex.longitude, shape.impactPolygon!))
    );
  }

  if (pointInPolygon(shape.coordinates.latitude, shape.coordinates.longitude, polygon)) {
    return true;
  }

  const radiusKm = getWaterImpactRadiusKm(shape);

  if (polygon.some((vertex) => waterAreaContainsPoint(shape, vertex))) {
    return true;
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (distancePointToSegmentKm(shape.coordinates, start, end) <= radiusKm) {
      return true;
    }
  }

  return false;
}

export function mapWaterFeatures(
  features: ArcgisFeatureResponse['features'],
  advisoryType: string,
  source: string,
  scope: WaterAdvisory['scope'],
) {
  return features
    .map<WaterAdvisory | null>((feature, index) => {
      const latitude = Number(feature.attributes.Lat ?? feature.attributes.LAT ?? feature.geometry?.y ?? 0);
      const longitude = Number(feature.attributes.Long ?? feature.attributes.LONG ?? feature.geometry?.x ?? 0);

      if (!latitude || !longitude) {
        return null;
      }

      const region = getRegionFromCoordinates(latitude, longitude);
      const systemName = String(feature.attributes.System_Name ?? feature.attributes.SYSTEM_NAME ?? 'Water system');
      const populationRange = toOptionalText(feature.attributes.Population_Range ?? feature.attributes.POPULATION_RANGE ?? null);
      const advisoryCategory = toOptionalText(feature.attributes.Advisory_Category ?? feature.attributes.ADVISORY_CATEGORY ?? null);
      const operatingPeriod = toOptionalText(feature.attributes.Operating_Period ?? feature.attributes.OPERATING_PERIOD ?? null);

      const advisory = {
        id: `${advisoryType}:${source}:${feature.attributes.OBJECTID ?? feature.attributes.objectid ?? index}`,
        systemName,
        issueDate: (feature.attributes.Issue_Date ?? feature.attributes.ISSUE_DATE ?? null) as number | string | null,
        advisoryType,
        scope,
        regionId: region.id,
        coordinates: { latitude, longitude },
        populationRange,
        advisoryCategory,
        operatingPeriod,
        impactRadiusMetres: 0,
        impactPolygon: null,
      };

      return {
        ...advisory,
        impactRadiusMetres: inferWaterImpactRadiusMetres(advisory),
      };
    })
    .filter(Boolean) as WaterAdvisory[];
}

function buildWaterDetail(advisory: WaterAdvisory, riskLevel: 'high' | 'moderate' | 'low'): AlertDetail {
  const radiusKm = advisory.impactRadiusMetres / 1000;
  const scopeNote = advisory.impactPolygon?.length
    ? 'This advisory has been matched to a mapped site footprint.'
    : advisory.scope === 'pws'
      ? `This public-system advisory is applied as an estimated local area of about ${radiusKm.toFixed(radiusKm >= 10 ? 0 : 1)} km around the mapped system location.`
      : `This site-specific advisory is applied as a tight local area of about ${radiusKm.toFixed(1)} km around the mapped site.`;

  return {
    id: advisory.id,
    category: 'water',
    title: advisory.systemName,
    summary: advisory.advisoryType,
    description: `${advisory.advisoryType} is active for ${advisory.systemName}. ${scopeNote} Do not use tap water for drinking, cooking, or food preparation until the advisory is lifted.`,
    source: STRINGS.waterSource,
    sourceUrl: 'https://www.gov.mb.ca/sd/water/drinking-water/advisory/index.html',
    authority: 'Province of Manitoba',
    geographicScope: `${advisory.systemName} (${advisory.regionId})`,
    riskLevel,
    issuedAt: advisory.issueDate,
    updatedAt: advisory.issueDate,
    coordinates: advisory.coordinates,
    impactRadiusMetres: advisory.impactRadiusMetres,
    impactPolygon: advisory.impactPolygon,
    regionIds: [advisory.regionId],
    recommendedActions: [
      'Boil all water for at least 1 minute before drinking, cooking, or making baby formula.',
      'Use bottled water for drinking and food preparation until the advisory is lifted.',
      'Boiled or bottled water is safe for bathing adults; use extra caution with infants.',
      'Do not make ice with tap water. Discard any ice made during the advisory period.',
      'Check official local updates for lifting notices and any system-specific instructions.',
    ],
  };
}

export async function fetchWaterAlerts(
  regions: ManitobaRegion[],
  userCoordinates?: { latitude: number; longitude: number } | null,
  selectedZone?: SubRegion | null,
  focusedRegionId?: RegionId | null,
) {
  const cacheKey = `${STORAGE_KEYS.water}:advisories`;
  const { data: fetchedAdvisories } = await withCacheFallback<WaterAdvisory[]>('water', cacheKey, async () => {
    await fetchJson(API_URLS.waterExperience);

    const [publicPws, publicSpws, other] = await Promise.all([
      fetchJson<ArcgisFeatureResponse>(API_URLS.waterPublicPws),
      fetchJson<ArcgisFeatureResponse>(API_URLS.waterPublicSpws),
      fetchJson<ArcgisFeatureResponse>(API_URLS.waterOther),
    ]);

    return [
      ...mapWaterFeatures(publicPws.features,   'Boil water advisory', 'pws',  'pws'),
      ...mapWaterFeatures(publicSpws.features,   'Boil water advisory', 'spws', 'spws'),
      ...mapWaterFeatures(other.features,        'Avoidance advisory',  'other','other'),
    ].sort((left, right) => {
      const leftTime  = new Date(left.issueDate  ?? 0).getTime();
      const rightTime = new Date(right.issueDate ?? 0).getTime();
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
  });
  const seasonalDisplayWindowOpen = isWithinSeasonalWaterDisplayWindow();
  const baseAdvisories = fetchedAdvisories.filter((advisory) =>
    shouldDisplayWaterAdvisory(advisory, seasonalDisplayWindowOpen),
  );

  const userPoint = userCoordinates
    ? { latitude: userCoordinates.latitude, longitude: userCoordinates.longitude }
    : null;
  const userRegionId = userPoint ? getRegionFromCoordinates(userPoint.latitude, userPoint.longitude).id : null;
  const preferredRegionIds = new Set<RegionId>(
    [userRegionId, selectedZone?.parentRegionId ?? null, focusedRegionId ?? null].filter(Boolean) as RegionId[],
  );
  const exactShapeCandidates = [...baseAdvisories]
    .filter((advisory) => isExactShapeEligible(advisory))
    .sort((left, right) => {
      const leftRegionPriority = preferredRegionIds.has(left.regionId) ? 0 : 1;
      const rightRegionPriority = preferredRegionIds.has(right.regionId) ? 0 : 1;
      if (leftRegionPriority !== rightRegionPriority) {
        return leftRegionPriority - rightRegionPriority;
      }

      if (userPoint) {
        return (
          getDistanceKm(
            userPoint.latitude,
            userPoint.longitude,
            left.coordinates.latitude,
            left.coordinates.longitude,
          ) -
          getDistanceKm(
            userPoint.latitude,
            userPoint.longitude,
            right.coordinates.latitude,
            right.coordinates.longitude,
          )
        );
      }

      return toSortableTime(right.issueDate) - toSortableTime(left.issueDate);
    });
  const exactShapeGroups = new Map<string, WaterAdvisory[]>();
  exactShapeCandidates.forEach((advisory) => {
    const siteKey = getWaterSiteIdentity(advisory);
    const current = exactShapeGroups.get(siteKey);
    if (current) {
      current.push(advisory);
      return;
    }
    exactShapeGroups.set(siteKey, [advisory]);
  });
  const groupedExactShapeCandidates = [...exactShapeGroups.values()].map((group) => group[0]);
  const limitedExactShapeCandidates = groupedExactShapeCandidates.slice(0, EXACT_SHAPE_LOOKUP_LIMIT);
  const shapeById = new Map<string, RegionCoordinate[] | null>();
  const uncachedShapeCandidates: WaterAdvisory[] = [];
  const cachedShapeEntries = await Promise.all(
    limitedExactShapeCandidates.map(async (advisory) => ({
      advisory,
      cachedPolygon: await readCachedExactWaterImpactPolygon(advisory),
    })),
  );

  cachedShapeEntries.forEach(({ advisory, cachedPolygon }) => {
    const siteKey = getWaterSiteIdentity(advisory);
    if (cachedPolygon !== undefined) {
      exactShapeGroups.get(siteKey)?.forEach((groupedAdvisory) => {
        shapeById.set(groupedAdvisory.id, cachedPolygon);
      });
      return;
    }

    uncachedShapeCandidates.push(advisory);
  });

  const advisories = baseAdvisories.map((advisory) =>
    getManualWaterImpactPolygonOverride(advisory) !== undefined
      ? {
          ...advisory,
          impactPolygon: getManualWaterImpactPolygonOverride(advisory) ?? null,
        }
      : shapeById.has(advisory.id)
      ? {
          ...advisory,
          impactPolygon: shapeById.get(advisory.id) ?? null,
        }
      : advisory,
  );

  const byRegion = regions.reduce<Record<RegionId, CategoryAlert>>((accumulator, region) => {
    const inRegion = advisories.filter((a) => a.regionId === region.id);
    const publicRelevant =
      userPoint && userRegionId === region.id
        ? dedupeWaterAdvisoriesBySite(inRegion.filter((a) => a.scope === 'pws' && waterAreaContainsPoint(a, userPoint)))
        : [];
    const locationSpecificRelevant =
      userPoint && userRegionId === region.id
        ? dedupeWaterAdvisoriesBySite(inRegion.filter((a) => a.scope !== 'pws' && waterAreaContainsPoint(a, userPoint)))
        : [];

    const pwsCount = publicRelevant.length;
    const spwsCount = locationSpecificRelevant.length;
    const totalAlertCount = pwsCount + spwsCount;
    const topAdvisory = publicRelevant[0] ?? locationSpecificRelevant[0] ?? null;

    const riskLevel: 'high' | 'moderate' | 'low' =
      pwsCount > 0 ? 'high' : spwsCount > 0 ? 'moderate' : 'low';

    const summaryParts: string[] = [];
    if (pwsCount > 0) {
      summaryParts.push(`${pwsCount} public-system advisory${pwsCount === 1 ? '' : 'ies'} affecting your location`);
    }
    if (spwsCount > 0) {
      summaryParts.push(`${spwsCount} site-specific advisory${spwsCount === 1 ? '' : 'ies'} affecting your location`);
    }
    if (summaryParts.length === 0) {
      summaryParts.push('No drinking water advisories affecting your location');
    }

    const detailItems = [...publicRelevant, ...locationSpecificRelevant]
      .slice(0, 5)
      .map((a) => `${a.advisoryType}: ${a.systemName}`);

    accumulator[region.id] = {
      category: 'water',
      value: riskLevel === 'low' ? 0 : totalAlertCount,
      riskLevel,
      summary: summaryParts.join(' | '),
      source: STRINGS.waterSource,
      sourceUrl: 'https://www.gov.mb.ca/sd/water/drinking-water/advisory/index.html',
      lastUpdated: topAdvisory?.issueDate ?? null,
      details: detailItems,
      dataStatus: 'live',
    };

    return accumulator;
  }, {} as Record<RegionId, CategoryAlert>);

  const visiblePublic = userPoint
    ? dedupeWaterAdvisoriesBySite(advisories.filter((a) => a.scope === 'pws' && waterAreaContainsPoint(a, userPoint)))
    : [];

  const visibleLocationSpecific = userPoint
    ? dedupeWaterAdvisoriesBySite(advisories.filter((a) => a.scope !== 'pws' && waterAreaContainsPoint(a, userPoint)))
    : [];

  const details: AlertDetail[] = [
    ...visiblePublic.map((a) => buildWaterDetail(a, 'high')),
    ...visibleLocationSpecific.map((a) => buildWaterDetail(a, 'moderate')),
  ];

  const mapDetails = dedupeWaterAdvisoriesBySite(advisories).map((a) =>
    buildWaterDetail(a, a.scope === 'pws' ? 'high' : 'moderate'),
  );

  return { byRegion, details, mapDetails, enrichmentCandidates: uncachedShapeCandidates } satisfies WaterServiceResult;
}

export async function enrichWaterAdvisoryShapes(
  candidates: readonly WaterAdvisory[],
  onPatch: (patches: ReadonlyMap<string, RegionCoordinate[] | null>) => void,
): Promise<void> {
  const TOTAL_TIMEOUT_MS = 30_000;
  const startTime = Date.now();

  for (let index = 0; index < candidates.length; index += EXACT_SHAPE_BATCH_SIZE) {
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      break;
    }

    const batch = candidates.slice(index, index + EXACT_SHAPE_BATCH_SIZE);

    try {
      const response = await postJson<OverpassResponse>(
        API_URLS.osmOverpass,
        buildOverpassShapeBatchQuery(batch),
      );
      const elements = response.elements ?? [];
      const patches = new Map<string, RegionCoordinate[] | null>();

      for (const advisory of batch) {
        const siteKey = getWaterSiteIdentity(advisory);
        const polygon = selectBestExactWaterImpactPolygon(advisory, elements);
        await writeCache(getShapeCacheKey(advisory), polygon);
        patches.set(siteKey, polygon);
      }

      onPatch(patches);
    } catch {

    }
  }
}
