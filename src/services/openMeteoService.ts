import { API_URLS, PREDICTION_CACHE_TTL_MS, STORAGE_KEYS } from '../constants/config';
import { fetchJson, readCache, readFreshCache, writeCache } from './serviceUtils';

export type OpenMeteoDayRow = {
  isoDate: string;
  highC: number;
  lowC: number;
  precipMm: number;
  windKmh: number;
  uvIndex: number;
  weatherCode: number;
  cloudCoverPct: number;
};

type OpenMeteoResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
    uv_index_max: number[];
    weathercode: number[];
    cloudcover_mean: number[];
  };
};

type ForecastTarget = {
  id: string;
  latitude: number;
  longitude: number;
};

export async function fetchOpenMeteoForecast(target: ForecastTarget): Promise<OpenMeteoDayRow[] | null> {
  const cacheKey = `${STORAGE_KEYS.openMeteo}:${target.id}`;
  const fresh = await readFreshCache<OpenMeteoDayRow[]>(cacheKey, PREDICTION_CACHE_TTL_MS);
  if (fresh?.data?.length) return fresh.data;

  try {
    const url =
      `${API_URLS.openMeteo}` +
      `?latitude=${target.latitude}` +
      `&longitude=${target.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,uv_index_max,weathercode,cloudcover_mean` +
      `&timezone=America%2FWinnipeg` +
      `&forecast_days=7`;

    const json = await fetchJson<OpenMeteoResponse>(url);
    const d = json.daily;
    const rows: OpenMeteoDayRow[] = (d.time ?? []).map((isoDate, i) => ({
      isoDate,
      highC: d.temperature_2m_max[i] ?? 0,
      lowC: d.temperature_2m_min[i] ?? 0,
      precipMm: d.precipitation_sum[i] ?? 0,
      windKmh: d.windspeed_10m_max[i] ?? 0,
      uvIndex: d.uv_index_max[i] ?? 0,
      weatherCode: d.weathercode[i] ?? 0,
      cloudCoverPct: d.cloudcover_mean[i] ?? 0,
    }));

    await writeCache(cacheKey, rows);
    return rows;
  } catch {
    const stale = await readCache<OpenMeteoDayRow[]>(cacheKey);
    return stale?.data ?? null;
  }
}
