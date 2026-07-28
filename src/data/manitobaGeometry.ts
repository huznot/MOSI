import { RegionCoordinate, RegionId } from '../types/alerts';

export type PolygonBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

type RawPolygonMap = Record<string, RegionCoordinate[]>;

const rawRhaPolygons = require('../../manitoba-rha-polygons.json') as RawPolygonMap;

function findPolygonByName(name: string, prefix?: string) {
  const exact = rawRhaPolygons[name];
  if (exact?.length) {
    return exact;
  }

  if (!prefix) {
    return [];
  }

  const matchedKey = Object.keys(rawRhaPolygons).find((key) => key.startsWith(prefix));
  return matchedKey ? rawRhaPolygons[matchedKey] ?? [] : [];
}

function samePoint(left: RegionCoordinate, right: RegionCoordinate) {
  return Math.abs(left.latitude - right.latitude) < 0.000001 && Math.abs(left.longitude - right.longitude) < 0.000001;
}

function normalizePolygon(polygon: readonly RegionCoordinate[]) {
  if (!polygon.length) {
    return [] as RegionCoordinate[];
  }

  const normalized = polygon.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  if (normalized.length > 1 && samePoint(normalized[0], normalized[normalized.length - 1])) {
    normalized.pop();
  }

  return normalized;
}

function averageCenter(polygon: readonly RegionCoordinate[]) {
  if (!polygon.length) {
    return { latitude: 0, longitude: 0 };
  }

  const sum = polygon.reduce(
    (accumulator, point) => ({
      latitude: accumulator.latitude + point.latitude,
      longitude: accumulator.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: sum.latitude / polygon.length,
    longitude: sum.longitude / polygon.length,
  };
}

function clipAgainstLongitude(
  polygon: readonly RegionCoordinate[],
  longitude: number,
  keepGreater: boolean,
) {
  if (!polygon.length) {
    return [] as RegionCoordinate[];
  }

  const clipped: RegionCoordinate[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = keepGreater ? current.longitude >= longitude : current.longitude <= longitude;
    const previousInside = keepGreater ? previous.longitude >= longitude : previous.longitude <= longitude;

    if (currentInside !== previousInside) {
      const deltaLongitude = current.longitude - previous.longitude;
      const ratio = deltaLongitude === 0 ? 0 : (longitude - previous.longitude) / deltaLongitude;
      clipped.push({
        latitude: previous.latitude + ratio * (current.latitude - previous.latitude),
        longitude,
      });
    }

    if (currentInside) {
      clipped.push(current);
    }
  }

  return clipped;
}

function clipAgainstLatitude(
  polygon: readonly RegionCoordinate[],
  latitude: number,
  keepGreater: boolean,
) {
  if (!polygon.length) {
    return [] as RegionCoordinate[];
  }

  const clipped: RegionCoordinate[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = keepGreater ? current.latitude >= latitude : current.latitude <= latitude;
    const previousInside = keepGreater ? previous.latitude >= latitude : previous.latitude <= latitude;

    if (currentInside !== previousInside) {
      const deltaLatitude = current.latitude - previous.latitude;
      const ratio = deltaLatitude === 0 ? 0 : (latitude - previous.latitude) / deltaLatitude;
      clipped.push({
        latitude,
        longitude: previous.longitude + ratio * (current.longitude - previous.longitude),
      });
    }

    if (currentInside) {
      clipped.push(current);
    }
  }

  return clipped;
}

function dedupePolygon(polygon: readonly RegionCoordinate[]) {
  if (!polygon.length) {
    return [] as RegionCoordinate[];
  }

  const deduped = polygon.reduce<RegionCoordinate[]>((accumulator, point) => {
    if (!accumulator.length || !samePoint(accumulator[accumulator.length - 1], point)) {
      accumulator.push(point);
    }
    return accumulator;
  }, []);

  if (deduped.length > 1 && samePoint(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }

  return deduped;
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

export const OFFICIAL_RHA_POLYGONS: Record<RegionId, RegionCoordinate[]> = {
  winnipeg: normalizePolygon(findPolygonByName('Winnipeg')),
  western: normalizePolygon(findPolygonByName('Prairie Mountain Health')),
  eastern: normalizePolygon(findPolygonByName('Interlake-Eastern')),
  southern: normalizePolygon(findPolygonByName('Southern Health-Sant\u00e9 Sud', 'Southern Health-Sant')),
  northern: normalizePolygon(findPolygonByName('Northern')),
};

export function getPolygonBounds(polygon: readonly RegionCoordinate[]): PolygonBounds {
  if (!polygon.length) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }

  return polygon.reduce<PolygonBounds>(
    (accumulator, point) => ({
      minLat: Math.min(accumulator.minLat, point.latitude),
      maxLat: Math.max(accumulator.maxLat, point.latitude),
      minLon: Math.min(accumulator.minLon, point.longitude),
      maxLon: Math.max(accumulator.maxLon, point.longitude),
    }),
    {
      minLat: polygon[0].latitude,
      maxLat: polygon[0].latitude,
      minLon: polygon[0].longitude,
      maxLon: polygon[0].longitude,
    },
  );
}

export function getPolygonCentroid(polygon: readonly RegionCoordinate[]) {
  if (polygon.length < 3) {
    return averageCenter(polygon);
  }

  let twiceArea = 0;
  let latitudeSum = 0;
  let longitudeSum = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const crossProduct = current.longitude * next.latitude - next.longitude * current.latitude;
    twiceArea += crossProduct;
    longitudeSum += (current.longitude + next.longitude) * crossProduct;
    latitudeSum += (current.latitude + next.latitude) * crossProduct;
  }

  if (Math.abs(twiceArea) < 0.000001) {
    return averageCenter(polygon);
  }

  return {
    latitude: latitudeSum / (3 * twiceArea),
    longitude: longitudeSum / (3 * twiceArea),
  };
}

export function clipPolygonToBounds(polygon: readonly RegionCoordinate[], bounds: PolygonBounds) {
  let clipped = normalizePolygon(polygon);
  clipped = clipAgainstLongitude(clipped, bounds.minLon, true);
  clipped = clipAgainstLongitude(clipped, bounds.maxLon, false);
  clipped = clipAgainstLatitude(clipped, bounds.minLat, true);
  clipped = clipAgainstLatitude(clipped, bounds.maxLat, false);
  clipped = dedupePolygon(clipped);

  return clipped.length >= 3 ? clipped : [];
}

export function pointInPolygon(latitude: number, longitude: number, polygon: readonly RegionCoordinate[]) {
  if (polygon.length < 3) {
    return false;
  }

  return pointInRing(latitude, longitude, polygon);
}
