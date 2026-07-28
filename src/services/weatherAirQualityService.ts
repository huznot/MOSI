import { AQHI_STATION_REGION_MAP, AQHI_STATIONS, API_URLS, STORAGE_KEYS } from '../constants/config';
import { STRINGS } from '../constants/strings';
import { CategoryAlert, ManitobaRegion, RegionId, RiskLevel } from '../types/alerts';
import { cleanText, fetchText, firstMatch, withCacheFallback } from './serviceUtils';
import { getDistanceKm } from './locationService';

type WeatherAirCache = {
  weatherByRegion: Record<RegionId, CategoryAlert>;
  airByRegion: Record<RegionId, CategoryAlert>;
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

export function getWeatherRiskLevel(hasWarning: boolean, temperature: number) {
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
  return `${API_URLS.weatherBase}?coords=${latitude},${longitude}`;
}

export function parseWeatherPage(html: string) {
  const observedAt =
    firstMatch(html, /<time datetime="([^"]+)"[^>]*>.*?<\/time>/is) ?? new Date().toISOString();
  const condition =
    cleanText(firstMatch(html, /<dt[^>]*>Condition:<\/dt>\s*<dd[^>]*><span[^>]*>(.*?)<\/span>/is) ?? '') ||
    STRINGS.defaultSummary;
  const temperatureText =
    firstMatch(html, /<dt[^>]*>Temperature:<\/dt>\s*<dd[^>]*><span[^>]*>(-?\d+(?:\.\d+)?)°<\/span>/is) ??
    firstMatch(html, /class="mrgn-bttm-sm lead mrgn-tp-sm"[^>]*><span[^>]*>(-?\d+(?:\.\d+)?)°<\/span>/is);
  const temperature = Number(temperatureText ?? '0');
  const noAlert = /id="noalert"[\s\S]*?No alerts in effect/i.test(html);
  const alertTitle = cleanText(firstMatch(html, /id="alertbox"[\s\S]*?<h2[^>]*>(.*?)<\/h2>/is) ?? '');
  const hasWarning = !noAlert && /id="alertbox"/i.test(html);

  return {
    observedAt,
    condition,
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

  const entries = await Promise.all(
    [...latestByCode.values()].map(async (file) => {
      const xml = await fetchText(`${API_URLS.aqhiIndex}${file}`);
      const regionName = firstMatch(xml, /<region[^>]*nameEn="([^"]+)"/i) ?? 'Unknown';
      const aqhi = Number(firstMatch(xml, /<airQualityHealthIndex>([^<]+)<\/airQualityHealthIndex>/i) ?? '0');
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

  return entries.reduce<Record<string, { aqhi: number; lastUpdated: string }>>((accumulator, entry) => {
    accumulator[entry.regionName] = { aqhi: entry.aqhi, lastUpdated: entry.lastUpdated };
    return accumulator;
  }, {});
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

export async function fetchWeatherAndAirQualityForPoint(latitude: number, longitude: number) {
  const cacheKey = `${STORAGE_KEYS.weather}:point:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  const { data } = await withCacheFallback<{
    weatherAlert: CategoryAlert;
    airAlert: CategoryAlert;
  }>('weather-air-point', cacheKey, async () => {
    const [aqhiByStation, html] = await Promise.all([
      fetchLatestAqhiReadings(),
      fetchText(buildWeatherUrlForCoordinates(latitude, longitude)),
    ]);

    const weather = parseWeatherPage(html);
    const weatherRisk = getWeatherRiskLevel(weather.hasWarning, weather.temperature);
    const stationName = getNearestAqhiStationName(latitude, longitude, aqhiByStation);
    const aqhiRecord = aqhiByStation[stationName] ?? aqhiByStation.Winnipeg;
    const aqhi = aqhiRecord?.aqhi ?? 0;
    const airRisk = getAirQualityRiskLevel(aqhi);

    return {
      weatherAlert: {
        category: 'weather',
        value: weather.temperature,
        riskLevel: weatherRisk,
        summary: weather.hasWarning ? weather.warningTitle : `${weather.condition}, ${weather.temperature}C`,
        source: STRINGS.weatherSource,
        sourceUrl: buildWeatherUrlForCoordinates(latitude, longitude),
        lastUpdated: weather.observedAt || new Date().toISOString(),
        details: weather.hasWarning ? [weather.condition, `${weather.temperature}C`] : [weather.condition],
        dataStatus: 'live',
      },
      airAlert: {
        category: 'airQuality',
        value: aqhi,
        riskLevel: airRisk,
        summary: `AQHI ${aqhi.toFixed(1)} for ${stationName}`,
        source: STRINGS.weatherSource,
        sourceUrl: API_URLS.aqhiIndex,
        lastUpdated: aqhiRecord?.lastUpdated ?? new Date().toISOString(),
        details: [`Nearest AQHI observation: ${stationName}`],
        dataStatus: 'live',
      },
    };
  });

  return data;
}

export async function fetchWeatherAndAirQuality(regions: ManitobaRegion[]) {
  const cacheKey = `${STORAGE_KEYS.weather}:all`;
  const { data } = await withCacheFallback<WeatherAirCache>('weather-air', cacheKey, async () => {
    const aqhiByStation = await fetchLatestAqhiReadings();

    const weatherEntries = await Promise.all(
      regions.map(async (region) => {
        const html = await fetchText(buildWeatherUrl(region));
        const weather = parseWeatherPage(html);
        const weatherRisk = getWeatherRiskLevel(weather.hasWarning, weather.temperature);
        const stationName = AQHI_STATION_REGION_MAP[region.id];
        const aqhiRecord = aqhiByStation[stationName] ?? aqhiByStation.Winnipeg;
        const aqhi = aqhiRecord?.aqhi ?? 0;
        const airRisk = getAirQualityRiskLevel(aqhi);

        const weatherAlert: CategoryAlert = {
          category: 'weather',
          value: weather.temperature,
          riskLevel: weatherRisk,
          summary: weather.hasWarning ? weather.warningTitle : `${weather.condition}, ${weather.temperature}C`,
          source: STRINGS.weatherSource,
          sourceUrl: buildWeatherUrl(region),
          lastUpdated: weather.observedAt || new Date().toISOString(),
          details: weather.hasWarning ? [weather.condition, `${weather.temperature}C`] : [weather.condition],
          dataStatus: 'live',
        };

        const airAlert: CategoryAlert = {
          category: 'airQuality',
          value: aqhi,
          riskLevel: airRisk,
          summary: `AQHI ${aqhi.toFixed(1)} for ${stationName}`,
          source: STRINGS.weatherSource,
          sourceUrl: API_URLS.aqhiIndex,
          lastUpdated: aqhiRecord?.lastUpdated ?? new Date().toISOString(),
          details: [`Nearest AQHI observation: ${stationName}`],
          dataStatus: 'live',
        };

        return { regionId: region.id, weatherAlert, airAlert };
      }),
    );

    return weatherEntries.reduce<WeatherAirCache>(
      (accumulator, entry) => {
        accumulator.weatherByRegion[entry.regionId] = entry.weatherAlert;
        accumulator.airByRegion[entry.regionId] = entry.airAlert;
        return accumulator;
      },
      {
        weatherByRegion: {} as Record<RegionId, CategoryAlert>,
        airByRegion: {} as Record<RegionId, CategoryAlert>,
      },
    );
  });

  return data;
}
