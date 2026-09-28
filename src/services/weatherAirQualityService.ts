import { AQHI_STATION_REGION_MAP, AQHI_STATIONS, API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { cleanText, fetchText, firstMatch, withCacheFallback } from './serviceUtils';
import { getDistanceKm } from './locationService';

type WeatherAirCache = {
  weatherByRegion: Partial<Record<RegionId, CategoryAlert>>;
  airByRegion: Partial<Record<RegionId, CategoryAlert>>;
};

export function getAirQualityRiskLevel(aqhi: number): RiskLevel {
  if (aqhi >= 7) {
    return 'high';
  }
  if (aqhi >= 4) {
    return 'moderate';
  }
  return 'low';
}

export function describeAqhi(aqhi: number) {
  if (aqhi >= 10) return 'very high risk';
  if (aqhi >= 7) return 'high risk';
  if (aqhi >= 4) return 'moderate risk';
  return 'low risk';
}

export function buildWeatherSummary(weather: ReturnType<typeof parseWeatherPage>) {
  if (weather.hasWarning) {
    return weather.warningTitle;
  }
  const temp = Number.isFinite(weather.temperature) ? `${Math.round(weather.temperature)}°C` : null;
  const reason =
    weather.temperature >= 32
      ? 'Extreme heat'
      : weather.temperature >= 28
        ? 'Hot'
        : weather.temperature <= -30
          ? 'Extreme cold'
          : weather.temperature <= -20
            ? 'Very cold'
            : null;
  return [reason, temp, weather.condition || null, 'no weather alerts in effect'].filter(Boolean).join(', ');
}

function buildAirSummary(aqhi: number, stationName: string) {
  return `AQHI ${aqhi.toFixed(1)} at ${stationName}, ${describeAqhi(aqhi)} (1-3 low, 4-6 moderate, 7+ high)`;
}

export function getWeatherRiskLevel(hasWarning: boolean, temperature: number) {
  if (!Number.isFinite(temperature)) {
    return hasWarning ? ('high' as const) : ('low' as const);
  }
  if (hasWarning || temperature <= -30 || temperature >= 32) {
    return 'high' as const;
  }
  if (temperature <= -20 || temperature >= 28) {
    return 'moderate' as const;
  }
  return 'low' as const;
}

export function buildWeatherUrl(region: ManitobaRegion) {
  return buildWeatherUrlForCoordinates(region.latitude, region.longitude);
}

export function buildWeatherUrlForCoordinates(latitude: number, longitude: number) {
  // ~1 km precision is enough to pick the right forecast page and avoids sending an exact position.
  return `${API_URLS.weatherBase}?coords=${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

export function parseWeatherPage(html: string) {
  const observedAt =
    firstMatch(html, /<time datetime="([^"]+)"[^>]*>.*?<\/time>/is) ?? new Date().toISOString();
  const condition =
    cleanText(firstMatch(html, /<dt[^>]*>Condition:<\/dt>\s*<dd[^>]*>\s*<(?:span|b)[^>]*>(.*?)<\/(?:span|b)>/is) ?? '');
  const temperatureText =
    firstMatch(html, /<dt[^>]*>Temperature:<\/dt>\s*<dd[^>]*><span[^>]*>(-?\d+(?:\.\d+)?)°<\/span>/is) ??
    firstMatch(html, /class="mrgn-bttm-sm lead mrgn-tp-sm"[^>]*><span[^>]*>(-?\d+(?:\.\d+)?)°<\/span>/is);
  const temperature = temperatureText === null ? Number.NaN : Number(temperatureText);
  const noAlert = /id="noalert"[\s\S]*?No alerts in effect/i.test(html);
  const alertTitle = cleanText(firstMatch(html, /id="alertbox"[\s\S]*?<h2[^>]*>(.*?)<\/h2>/is) ?? '');
  const hasWarning = !noAlert && /id="alertbox"/i.test(html);

  if (!Number.isFinite(temperature) && !hasWarning && !noAlert) {
    // Nothing recognisable on the page - treat as a failed fetch rather than guessing.
    throw new Error('Unrecognised weather page');
  }

  return {
    observedAt,
    condition: /not observed/i.test(condition) ? '' : condition,
    temperature,
    hasWarning,
    warningTitle: hasWarning ? alertTitle || 'Weather warning in effect' : '',
  };
}

export async function fetchLatestAqhiReadings() {
  const index = await fetchText(API_URLS.aqhiIndex);
  const files = [...new Set([...index.matchAll(/href="(AQ_OBS_[^"]+\.xml)"/g)].map((match) => match[1]))];
  const latestByCode = new Map<string, string>();

  files.forEach((file) => {
    const code = file.split('_')[2];
    const current = latestByCode.get(code);
    if (!current || file > current) {
      latestByCode.set(code, file);
    }
  });

  const settled = await Promise.allSettled(
    [...latestByCode.values()].map(async (file) => {
      const xml = await fetchText(`${API_URLS.aqhiIndex}${file}`);
      const regionName = firstMatch(xml, /<region[^>]*nameEn="([^"]+)"/i) ?? 'Unknown';
      const aqhi = Number(firstMatch(xml, /<airQualityHealthIndex>([^<]+)<\/airQualityHealthIndex>/i) ?? 'NaN');
      const lastUpdated =
        firstMatch(xml, /<UTCStamp>([^<]+)<\/UTCStamp>/i)?.replace(
          /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
          '$1-$2-$3T$4:$5:$6Z',
        ) ?? new Date().toISOString();

      return {
        regionName,
        aqhi,
        lastUpdated,
      };
    }),
  );

  const readings = settled.reduce<Record<string, { aqhi: number; lastUpdated: string }>>((accumulator, result) => {
    if (result.status === 'fulfilled' && Number.isFinite(result.value.aqhi)) {
      accumulator[result.value.regionName] = { aqhi: result.value.aqhi, lastUpdated: result.value.lastUpdated };
    }
    return accumulator;
  }, {});

  if (!Object.keys(readings).length) {
    throw new Error('No AQHI readings available');
  }
  return readings;
}

function getNearestAqhiStationName(
  latitude: number,
  longitude: number,
  aqhiByStation: Record<string, { aqhi: number; lastUpdated: string }>,
) {
  const availableStations = AQHI_STATIONS.filter((station) => aqhiByStation[station.name]);
  const candidates = availableStations.length ? availableStations : AQHI_STATIONS;

  return [...candidates]
    .sort(
      (left, right) =>
        getDistanceKm(latitude, longitude, left.latitude, left.longitude) -
        getDistanceKm(latitude, longitude, right.latitude, right.longitude),
    )[0]?.name ?? 'Winnipeg';
}

function buildWeatherAlert(html: string, sourceUrl: string): CategoryAlert {
  const weather = parseWeatherPage(html);
  return {
    category: 'weather',
    value: Number.isFinite(weather.temperature) ? weather.temperature : 'n/a',
    riskLevel: getWeatherRiskLevel(weather.hasWarning, weather.temperature),
    summary: buildWeatherSummary(weather),
    source: STRINGS.weatherSource,
    sourceUrl,
    lastUpdated: weather.observedAt || new Date().toISOString(),
    details: [weather.condition].filter(Boolean),
    dataStatus: 'live',
  };
}

function buildAirAlert(aqhiRecord: { aqhi: number; lastUpdated: string }, stationName: string): CategoryAlert {
  return {
    category: 'airQuality',
    value: aqhiRecord.aqhi,
    riskLevel: getAirQualityRiskLevel(aqhiRecord.aqhi),
    summary: buildAirSummary(aqhiRecord.aqhi, stationName),
    source: STRINGS.weatherSource,
    sourceUrl: 'https://weather.gc.ca/airquality/pages/provincial_summary/mb_e.html',
    lastUpdated: aqhiRecord.lastUpdated,
    details: [`Nearest AQHI station: ${stationName}`],
    dataStatus: 'live',
  };
}

/**
 * Weather and air quality for one point. Each half is optional: a failure in one
 * source must not wipe out the other.
 */
export async function fetchWeatherAndAirQualityForPoint(latitude: number, longitude: number) {
  const cacheKey = `${STORAGE_KEYS.weather}:point:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
  const { data } = await withCacheFallback<{ weatherAlert?: CategoryAlert; airAlert?: CategoryAlert }>(
    'weather-air-point',
    cacheKey,
    async () => {
      const [aqhiResult, htmlResult] = await Promise.allSettled([
        fetchLatestAqhiReadings(),
        fetchText(buildWeatherUrlForCoordinates(latitude, longitude)),
      ]);

      let weatherAlert: CategoryAlert | undefined;
      if (htmlResult.status === 'fulfilled') {
        try {
          weatherAlert = buildWeatherAlert(htmlResult.value, buildWeatherUrlForCoordinates(latitude, longitude));
        } catch {
          weatherAlert = undefined;
        }
      }

      let airAlert: CategoryAlert | undefined;
      if (aqhiResult.status === 'fulfilled') {
        const stationName = getNearestAqhiStationName(latitude, longitude, aqhiResult.value);
        const record = aqhiResult.value[stationName];
        airAlert = record ? buildAirAlert(record, stationName) : undefined;
      }

      if (!weatherAlert && !airAlert) {
        throw new Error('Weather and air quality unavailable');
      }
      return { weatherAlert, airAlert };
    },
  );

  return data;
}

export async function fetchWeatherAndAirQuality(regions: ManitobaRegion[]) {
  const cacheKey = `${STORAGE_KEYS.weather}:all`;
  const { data } = await withCacheFallback<WeatherAirCache>('weather-air', cacheKey, async () => {
    const [aqhiResult, ...pageResults] = await Promise.allSettled([
      fetchLatestAqhiReadings(),
      ...regions.map((region) => fetchText(buildWeatherUrl(region))),
    ]);
    const aqhiByStation = aqhiResult.status === 'fulfilled' ? (aqhiResult.value as Awaited<ReturnType<typeof fetchLatestAqhiReadings>>) : null;

    const result: WeatherAirCache = { weatherByRegion: {}, airByRegion: {} };
    regions.forEach((region, index) => {
      const page = pageResults[index];
      if (page.status === 'fulfilled') {
        try {
          result.weatherByRegion[region.id] = buildWeatherAlert(page.value as string, buildWeatherUrl(region));
        } catch {
          // Leave this region's weather missing; the aggregator marks it unavailable.
        }
      }

      if (aqhiByStation) {
        const preferred = AQHI_STATION_REGION_MAP[region.id];
        const stationName = aqhiByStation[preferred]
          ? preferred
          : getNearestAqhiStationName(region.latitude, region.longitude, aqhiByStation);
        const record = aqhiByStation[stationName];
        if (record) {
          result.airByRegion[region.id] = buildAirAlert(record, stationName);
        }
      }
    });

    if (!Object.keys(result.weatherByRegion).length && !Object.keys(result.airByRegion).length) {
      throw new Error('Weather and air quality unavailable');
    }
    return result;
  });

  return data;
}
