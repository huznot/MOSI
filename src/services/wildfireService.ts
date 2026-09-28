import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { AlertDetail, CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { fetchJson, withCacheFallback } from './serviceUtils';
import { getDistanceKm, getRegionById, getRegionFromCoordinates } from './locationService';

// CWFIF national active fires (replaced the retired CWFIS `activefires_current` layer in 2026).
type FireFeatureCollection = {
  features: Array<{
    properties: {
      agency_code?: string;
      agency_fire_id?: string;
      national_fire_id?: string;
      fire_size?: number;
      stage_of_control_status?: string;
      situation_report_date?: string;
      latitude?: number;
      longitude?: number;
    };
  }>;
};

const STAGE_LABELS: Record<string, string> = {
  OC: 'out of control',
  BH: 'being held',
  UC: 'under control',
};

type ActiveFire = {
  id: string;
  name: string;
  hectares: number;
  stage: string | null;
  reportedAt: string | null;
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
    summary: `${Math.round(fire.hectares).toLocaleString('en-CA')} ha${fire.stage ? `, ${fire.stage}` : ''}, about ${Math.round(
      fire.nearestRegionDistanceKm,
    )} km from ${getRegionById(fire.nearestRegionId).label}`,
    description: `${fire.name} is an active wildfire of about ${Math.round(fire.hectares).toLocaleString('en-CA')} hectares${
      fire.stage ? ` and is currently ${fire.stage}` : ''
    }. Smoke conditions can change quickly with wind and fire behaviour.`,
    source: STRINGS.wildfireSource,
    sourceUrl: 'https://cwfis.cfs.nrcan.gc.ca/interactive-map',
    authority: 'Canadian Wildland Fire Information System',
    geographicScope: `Nearest Manitoba region: ${getRegionById(fire.nearestRegionId).label}`,
    riskLevel,
    issuedAt: fire.reportedAt ?? new Date().toISOString(),
    updatedAt: fire.reportedAt ?? new Date().toISOString(),
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
      .filter((feature) => feature.properties.stage_of_control_status !== 'OUT')
      .map((feature, index) => {
        const props = feature.properties;
        const agency = props.agency_code ?? '';
        return {
          name: props.agency_fire_id ? `${agency} fire ${props.agency_fire_id}`.trim() : `Active fire ${index + 1}`,
          hectares: Number(props.fire_size) || 0,
          stage: STAGE_LABELS[props.stage_of_control_status ?? ''] ?? null,
          reportedAt: props.situation_report_date ?? null,
          latitude: Number(props.latitude) || 0,
          longitude: Number(props.longitude) || 0,
        };
      })
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
        sourceUrl: 'https://cwfis.cfs.nrcan.gc.ca/interactive-map',
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
