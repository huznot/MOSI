import { STORAGE_KEYS } from '../constants/config';
import { HydroOutage, RegionCoordinate } from '../types/alerts';
import { fetchJson, withCacheFallback } from './serviceUtils';

const HYDRO_URL =
  'https://services2.arcgis.com/QoeQkfdOG126FqSi/ArcGIS/rest/services/' +
  'Manitoba_Hydro_Current_Power_Outages/FeatureServer/0/query' +
  '?where=1%3D1&outFields=*&returnGeometry=true&f=json&outSR=4326&resultRecordCount=300';

const MB_LAT_MIN = 48.5;
const MB_LAT_MAX = 61.0;
const MB_LON_MIN = -103.0;
const MB_LON_MAX = -87.0;

type HydroAttributes = {
  OBJECTID: number;
  OUTAGE_ID?: string | null;
  OUTAGE_TYPE?: string | null;
  TIME_OF_OUTAGE?: number | null;
  NUM_CUST_NOPOWER?: number | null;
  NUM_CUST_NOPOWERTXT?: string | null;
  ETR?: number | null;
  FIELD_VERIFIED_ETR?: number | null;
  CAUSE?: string | null;
  SUBCAUSE?: string | null;
  CREW_STATUS?: string | null;
};

type HydroFeature = {
  attributes: HydroAttributes;
  geometry: { rings: number[][][] } | null;
};

type HydroResponse = {
  features?: HydroFeature[];
};

function msToIso(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  try {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function ringToCoords(ring: number[][]): RegionCoordinate[] {
  return ring
    .map(([x, y]) => ({ latitude: y, longitude: x }))
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

function centroidOf(ring: RegionCoordinate[]): RegionCoordinate {
  const lat = ring.reduce((s, p) => s + p.latitude, 0) / ring.length;
  const lon = ring.reduce((s, p) => s + p.longitude, 0) / ring.length;
  return { latitude: lat, longitude: lon };
}

function isInManitobaBounds(c: RegionCoordinate): boolean {
  return c.latitude >= MB_LAT_MIN && c.latitude <= MB_LAT_MAX && c.longitude >= MB_LON_MIN && c.longitude <= MB_LON_MAX;
}

export { HydroOutage };

export async function fetchHydroOutages(): Promise<HydroOutage[]> {
  const { data } = await withCacheFallback<HydroOutage[]>('hydro-outages', STORAGE_KEYS.hydroOutages, async () => {
    const response = await fetchJson<HydroResponse>(HYDRO_URL);

    if (!response.features?.length) return [];

    return response.features
      .map((feature): HydroOutage | null => {
        const a = feature.attributes;
        const rings = feature.geometry?.rings;
        if (!rings?.length) return null;

        const polygon = ringToCoords(rings[0] ?? []);
        if (polygon.length < 3) return null;

        const centroid = centroidOf(polygon);
        if (!isInManitobaBounds(centroid)) return null;

        const cause = [a.CAUSE, a.SUBCAUSE].filter(Boolean).join(' — ') || 'Under investigation';

        return {
          id: `hydro-${a.OBJECTID}`,
          outageType: a.OUTAGE_TYPE ?? 'Unplanned',
          timeOfOutage: msToIso(a.TIME_OF_OUTAGE),
          estimatedRestoration: msToIso(a.FIELD_VERIFIED_ETR ?? a.ETR),
          customersAffected: a.NUM_CUST_NOPOWER ?? 0,
          customersAffectedLabel: a.NUM_CUST_NOPOWERTXT ?? String(a.NUM_CUST_NOPOWER ?? 0),
          cause,
          crewStatus: a.CREW_STATUS ?? 'Unknown',
          polygon,
          centroid,
        };
      })
      .filter((o): o is HydroOutage => o !== null);
  });

  return data;
}
