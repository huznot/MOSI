import * as Location from 'expo-location';

import {
  DEFAULT_REGION_ID,
  LOCAL_AREA_TARGET_POPULATION,
  MANITOBA_POPULATION_CENTERS,
  MANITOBA_REGIONS,
} from '../constants/config';
import {
  LocalAreaProfile,
  LocationPermissionState,
  ManitobaRegion,
  RegionCoordinate,
  RegionId,
  UserCoordinates,
} from '../types/alerts';
import { MANITOBA_SUB_REGIONS, SubRegion } from '../data/manitobaSubRegions';

type DetectRegionResult = {
  permissionStatus: LocationPermissionState;
  region: ManitobaRegion;
  coordinates: UserCoordinates | null;
};

const LOCAL_AREA_RADIUS_KM = {
  min: 4.5,
  max: 22,
  winnipegMax: 8,
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pointInRing(latitude: number, longitude: number, polygon: readonly RegionCoordinate[]) {
  let isInside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.latitude > latitude !== previousPoint.latitude > latitude &&
      longitude <
        ((previousPoint.longitude - currentPoint.longitude) * (latitude - currentPoint.latitude)) /
          (previousPoint.latitude - currentPoint.latitude) +
          currentPoint.longitude;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function pointInPolygon(
  latitude: number,
  longitude: number,
  polygon: readonly RegionCoordinate[],
  holes?: readonly (readonly RegionCoordinate[])[],
) {
  if (!pointInRing(latitude, longitude, polygon)) {
    return false;
  }

  return !(holes ?? []).some((hole) => pointInRing(latitude, longitude, hole));
}

function getDistanceScore(latitude: number, longitude: number, region: ManitobaRegion) {
  const latitudeDelta = latitude - region.latitude;
  const longitudeDelta = longitude - region.longitude;
  return latitudeDelta ** 2 + longitudeDelta ** 2;
}

function getLongitudeDelta(kilometers: number, latitude: number) {
  const cosLatitude = Math.cos((latitude * Math.PI) / 180);
  return kilometers / (111.32 * Math.max(cosLatitude, 0.2));
}

function getLatitudeDelta(kilometers: number) {
  return kilometers / 110.57;
}

function moveCoordinate(center: RegionCoordinate, radiusKm: number, bearingDegrees: number): RegionCoordinate {
  const radians = (bearingDegrees * Math.PI) / 180;
  const latitudeDelta = getLatitudeDelta(radiusKm * Math.sin(radians));
  const longitudeDelta = getLongitudeDelta(radiusKm * Math.cos(radians), center.latitude);

  return {
    latitude: center.latitude + latitudeDelta,
    longitude: center.longitude + longitudeDelta,
  };
}

function shrinkPointIntoRegion(center: RegionCoordinate, point: RegionCoordinate, region: ManitobaRegion) {
  let candidate = point;
  let attempts = 0;

  while (
    attempts < 7 &&
    !pointInPolygon(candidate.latitude, candidate.longitude, region.polygon, region.holes)
  ) {
    candidate = {
      latitude: center.latitude + (candidate.latitude - center.latitude) * 0.78,
      longitude: center.longitude + (candidate.longitude - center.longitude) * 0.78,
    };
    attempts += 1;
  }

  return candidate;
}

function getNearestPopulationCenter(region: ManitobaRegion, center: RegionCoordinate) {
  const candidates = MANITOBA_POPULATION_CENTERS.filter((item) => item.regionId === region.id);
  const pool = candidates.length ? candidates : MANITOBA_POPULATION_CENTERS;

  return [...pool].sort(
    (left, right) =>
      getDistanceKm(center.latitude, center.longitude, left.latitude, left.longitude) -
      getDistanceKm(center.latitude, center.longitude, right.latitude, right.longitude),
  )[0];
}

function getDirectionalLabel(center: RegionCoordinate, anchor: RegionCoordinate) {
  const distanceKm = getDistanceKm(center.latitude, center.longitude, anchor.latitude, anchor.longitude);

  if (distanceKm < 2) {
    return 'Central';
  }

  const latitudeDelta = anchor.latitude - center.latitude;
  const longitudeDelta = anchor.longitude - center.longitude;
  const latitudeLabel = latitudeDelta >= 0.08 ? 'North' : latitudeDelta <= -0.08 ? 'South' : '';
  const longitudeLabel = longitudeDelta >= 0.12 ? 'East' : longitudeDelta <= -0.12 ? 'West' : '';

  if (latitudeLabel && longitudeLabel) {
    return `${latitudeLabel}${longitudeLabel.toLowerCase()}`;
  }

  return latitudeLabel || longitudeLabel || 'Central';
}

function getLocalAreaRadiusKm(region: ManitobaRegion, density: number, anchor: RegionCoordinate, seedCenter: RegionCoordinate) {
  const targetAreaKm = LOCAL_AREA_TARGET_POPULATION / Math.max(density, 90);
  const densityRadius = Math.sqrt(targetAreaKm / Math.PI) * 1.9;
  const spreadBoost = clamp(
    getDistanceKm(anchor.latitude, anchor.longitude, seedCenter.latitude, seedCenter.longitude) * 0.08,
    0,
    4,
  );
  const maxRadius = region.id === 'winnipeg' ? LOCAL_AREA_RADIUS_KM.winnipegMax : LOCAL_AREA_RADIUS_KM.max;

  return clamp(densityRadius + spreadBoost, LOCAL_AREA_RADIUS_KM.min, maxRadius);
}

function buildLocalAreaPolygon(region: ManitobaRegion, center: RegionCoordinate, radiusKm: number, rotation: number) {
  const factors = [1.12, 0.94, 1.08, 0.9, 1.06, 0.92, 1.14, 0.88];

  return factors.map((factor, index) => {
    const bearing = rotation + index * 45;
    const point = moveCoordinate(center, radiusKm * factor, bearing);
    return shrinkPointIntoRegion(center, point, region);
  });
}

function getLocalAreaShortLabel(populationLabel: string, direction: string) {
  const abbreviatedLabel =
    populationLabel === 'Winnipeg'
      ? 'WPG'
      : populationLabel
          .split(/\s+/)
          .map((word) => word[0])
          .join('')
          .slice(0, 4)
          .toUpperCase();

  if (direction === 'Central') {
    return abbreviatedLabel;
  }

  return `${direction.slice(0, 2).toUpperCase()} ${abbreviatedLabel}`;
}

export function getRegionById(regionId: RegionId) {
  return MANITOBA_REGIONS.find((region) => region.id === regionId) as ManitobaRegion;
}

export function getAllRegions() {
  return [...MANITOBA_REGIONS] as ManitobaRegion[];
}

export function findRegionByCoordinates(latitude: number, longitude: number) {
  return MANITOBA_REGIONS.find((region) => pointInPolygon(latitude, longitude, region.polygon, region.holes)) ?? null;
}

export function getRegionFromCoordinates(latitude: number, longitude: number) {
  const matched = findRegionByCoordinates(latitude, longitude);

  if (matched) {
    return matched;
  }

  const nearest = [...MANITOBA_REGIONS].sort(
    (left, right) => getDistanceScore(latitude, longitude, left) - getDistanceScore(latitude, longitude, right),
  )[0];

  return nearest ?? getRegionById(DEFAULT_REGION_ID);
}

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildLocalAreaProfile(region: ManitobaRegion, coordinates?: UserCoordinates | RegionCoordinate | null) {
  const anchor = coordinates
    ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
    : { latitude: region.latitude, longitude: region.longitude };
  const populationCenter = getNearestPopulationCenter(region, anchor);
  const seedCenter = { latitude: populationCenter.latitude, longitude: populationCenter.longitude };
  const direction = getDirectionalLabel(seedCenter, anchor);
  const localLabel =
    direction === 'Central' ? `${populationCenter.label}` : `${direction} ${populationCenter.label}`;
  const radiusKm = getLocalAreaRadiusKm(region, populationCenter.density, anchor, seedCenter);
  const polygon = buildLocalAreaPolygon(
    region,
    anchor,
    radiusKm,
    ((anchor.latitude + anchor.longitude) * 37) % 45,
  );

  return {
    id: `${region.id}:${localLabel.toLowerCase().replace(/\s+/g, '-')}`,
    label: `${localLabel} Local Area`,
    shortLabel: getLocalAreaShortLabel(populationCenter.label, direction),
    description: `Approximate ${LOCAL_AREA_TARGET_POPULATION.toLocaleString('en-CA')}-person catchment generated from your ${coordinates ? 'location' : 'selected region center'} and Manitoba population-density proxies.`,
    parentRegionId: region.id,
    center: anchor,
    polygon,
    populationTarget: LOCAL_AREA_TARGET_POPULATION,
  } satisfies LocalAreaProfile;
}

export function buildZoneAreaProfile(subRegion: SubRegion): LocalAreaProfile {
  return {
    id: `zone:${subRegion.id}`,
    label: subRegion.name,
    shortLabel: subRegion.shortName,
    description: `Manual zone selection anchored to the displayed ${subRegion.name} boundary.`,
    parentRegionId: subRegion.parentRegionId,
    center: subRegion.center,
    polygon: subRegion.polygon,
    populationTarget: LOCAL_AREA_TARGET_POPULATION,
  } satisfies LocalAreaProfile;
}

export function findSubRegionByCoordinates(latitude: number, longitude: number): SubRegion | null {

  if (latitude < 48.5 || latitude > 61.0 || longitude < -102.5 || longitude > -88.0) {
    return null;
  }

  const inBounds = MANITOBA_SUB_REGIONS.filter(
    (sr) =>
      latitude >= sr.bounds.minLat &&
      latitude <= sr.bounds.maxLat &&
      longitude >= sr.bounds.minLon &&
      longitude <= sr.bounds.maxLon,
  );

  if (inBounds.length === 1) return inBounds[0];

  const inPolygon = inBounds.filter((sr) => {
    const coords = sr.polygon;
    return pointInRing(latitude, longitude, coords);
  });

  if (inPolygon.length > 0) {

    return inPolygon.reduce((best, current) => {
      const bestDist = getDistanceKm(latitude, longitude, best.center.latitude, best.center.longitude);
      const curDist = getDistanceKm(latitude, longitude, current.center.latitude, current.center.longitude);
      return curDist < bestDist ? current : best;
    });
  }

  return [...MANITOBA_SUB_REGIONS].sort(
    (a, b) =>
      getDistanceKm(latitude, longitude, a.center.latitude, a.center.longitude) -
      getDistanceKm(latitude, longitude, b.center.latitude, b.center.longitude),
  )[0] ?? null;
}

export function buildSubRegionLabel(subRegion: SubRegion): string {
  return subRegion.name;
}

export async function detectUserRegion(): Promise<DetectRegionResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      return {
        permissionStatus: permission.status,
        region: getRegionById(DEFAULT_REGION_ID),
        coordinates: null,
      };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    const coordinates = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: new Date(location.timestamp).toISOString(),
    } satisfies UserCoordinates;

    return {
      permissionStatus: permission.status,
      region: getRegionFromCoordinates(location.coords.latitude, location.coords.longitude),
      coordinates,
    };
  } catch {
    return {
      permissionStatus: 'denied',
      region: getRegionById(DEFAULT_REGION_ID),
      coordinates: null,
    };
  }
}
