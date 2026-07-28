import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { AlertDetail, CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { fetchJson, withCacheFallback } from './serviceUtils';
import { getDistanceKm, getRegionFromCoordinates } from './locationService';

type FireFeatureCollection = {
  features: Array<{
    properties: {
      firename?: string;
      hectares?: number;
      lat?: number;
      lon?: number;
    };
  }>;
};

type ActiveFire = {
  id: string;
  name: string;
  hectares: number;
  latitude: number;
  longitude: number;
  nearestRegionId: RegionId;
  nearestRegionDistanceKm: number;
};

type WildfireServiceResult = {
  byRegion: Record<RegionId, CategoryAlert>;
  details: AlertDetail[];
};

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getLegacyDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getWildfireRiskLevel(distanceKm: number, fireCount: number): RiskLevel {
  if (!fireCount || distanceKm > 500) {
    return 'low';
  }
  if (distanceKm <= 100) {
    return 'high';
  }
  return 'moderate';
}

function buildWildfireDetail(fire: ActiveFire): AlertDetail {
  const riskLevel = getWildfireRiskLevel(fire.nearestRegionDistanceKm, 1);

  return {
    id: fire.id,
    category: 'wildfire',
    title: fire.name,
    summary: `${Math.round(fire.nearestRegionDistanceKm)} km from ${fire.nearestRegionId}`,
    description: `${fire.name} is an active wildfire with an estimated size of ${Math.round(
      fire.hectares,
    )} hectares. Smoke conditions can change quickly with wind and fire behaviour.`,
    source: STRINGS.wildfireSource,
    sourceUrl: API_URLS.wildfire,
    authority: 'Canadian Wildland Fire Information System',
    geographicScope: `Nearest Manitoba region: ${fire.nearestRegionId}`,
    riskLevel,
    issuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coordinates: { latitude: fire.latitude, longitude: fire.longitude },
    regionIds: [fire.nearestRegionId],
    recommendedActions: [
      'Stay indoors and keep windows and doors closed if smoke is visible or the smell is strong.',
      'Use an N95 or KN95 respirator if you must go outside. Cloth masks do not filter smoke particles well.',
      'Set your home HVAC to recirculate air (do not pull in outside air) until smoke clears.',
      'Check on elderly neighbours, young children, and anyone with asthma or heart conditions.',
      'If smoke causes chest tightness, shortness of breath, or confusion, seek medical attention immediately.',
    ],
  };
}

export async function fetchWildfireAlerts(regions: ManitobaRegion[]) {
  const cacheKey = `${STORAGE_KEYS.wildfire}:all`;
  const { data } = await withCacheFallback<WildfireServiceResult>('wildfire', cacheKey, async () => {
    const response = await fetchJson<FireFeatureCollection>(API_URLS.wildfire);
    const fires = response.features
      .map((feature, index) => ({
        name: feature.properties.firename ?? `Active fire ${index + 1}`,
        hectares: feature.properties.hectares ?? 0,
        latitude: feature.properties.lat ?? 0,
        longitude: feature.properties.lon ?? 0,
      }))
      .filter((fire) => fire.latitude && fire.longitude)
      .map<ActiveFire>((fire, index) => {
        const nearestRegion = [...regions]
          .map((region) => ({
            region,
            distanceKm: getLegacyDistanceKm(region.latitude, region.longitude, fire.latitude, fire.longitude),
          }))
          .sort((left, right) => left.distanceKm - right.distanceKm)[0];

        return {
          id: `wildfire:${index}:${fire.latitude}:${fire.longitude}`,
          ...fire,
          nearestRegionId: nearestRegion.region.id,
          nearestRegionDistanceKm: nearestRegion.distanceKm,
        };
      })
      .filter((fire) => fire.nearestRegionDistanceKm <= 700)

      .filter((fire) => fire.latitude >= 48.5 && fire.latitude <= 61.0 && fire.longitude >= -103.0 && fire.longitude <= -87.0);

    const byRegion = regions.reduce<Record<RegionId, CategoryAlert>>((accumulator, region) => {
      const distances = fires.map((fire) => ({
        ...fire,
        distanceKm: getLegacyDistanceKm(region.latitude, region.longitude, fire.latitude, fire.longitude),
      }));
      const nearby = distances.filter((fire) => fire.distanceKm <= 500);
      const nearest = [...nearby].sort((left, right) => left.distanceKm - right.distanceKm)[0];
      const riskLevel = getWildfireRiskLevel(nearest?.distanceKm ?? Number.POSITIVE_INFINITY, nearby.length);
      accumulator[region.id] = {
        category: 'wildfire',
        value: nearby.length,
        riskLevel,
        summary: nearest
          ? `${nearby.length} fire(s) within 500 km, nearest ${Math.round(nearest.distanceKm)} km away`
          : 'No active fires within 500 km',
        source: STRINGS.wildfireSource,
        sourceUrl: API_URLS.wildfire,
        lastUpdated: new Date().toISOString(),
        details: nearest ? [`Nearest fire: ${nearest.name}`, `${Math.round(nearest.hectares)} hectares`] : [],
        dataStatus: 'live',
      };
      return accumulator;
    }, {} as Record<RegionId, CategoryAlert>);

    return {
      byRegion,
      details: fires
        .sort((left, right) => left.nearestRegionDistanceKm - right.nearestRegionDistanceKm)
        .slice(0, 12)
        .map(buildWildfireDetail),
    };
  });

  return data;
}
