import { CategoryId, ManitobaRegion } from '../types/alerts';
import { OFFICIAL_RHA_POLYGONS, getPolygonBounds } from '../data/manitobaGeometry';

export const API_URLS = {
  weatherBase: 'https://weather.gc.ca/en/location/index.html',
  aqhiIndex: 'https://dd.weather.gc.ca/today/air_quality/aqhi/pnr/observation/realtime/xml/',
  wildfire:
    'https://cwfis.cfs.nrcan.gc.ca/geoserver/public/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=public:activefires_current&outputFormat=application/json',
  waterExperience:
    'https://www.arcgis.com/sharing/rest/content/items/7024e973cd9b4045b5bb8952ce2b3a19/data?f=json',
  waterPublicPws:
    'https://services.arcgis.com/mMUesHYPkXjaFGfS/arcgis/rest/services/Current_BWAPWS/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
  waterPublicSpws:
    'https://services.arcgis.com/mMUesHYPkXjaFGfS/arcgis/rest/services/Current_BWA_SPWS/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
  waterOther:
    'https://services.arcgis.com/mMUesHYPkXjaFGfS/arcgis/rest/services/Current_DWAA_SPWS/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
  osmOverpass: 'https://overpass-api.de/api/interpreter',
  beachMonitoring:
    'https://services.arcgis.com/mMUesHYPkXjaFGfS/arcgis/rest/services/Beach_Water_Quality_Monitoring_Sample_Results_view/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
  healthPublic: 'https://www.gov.mb.ca/health/publichealth/',
  healthProtectionReports: 'https://www.gov.mb.ca/health/publichealth/protection/reports.html',
  vectorTick: 'https://www.gov.mb.ca/health/publichealth/cdc/tickborne/index.html',
  openMeteo: 'https://api.open-meteo.com/v1/forecast',
} as const;

export const STORAGE_KEYS = {
  appState: 'mosi-app-state',
  notifications: 'mosi-notifications',
  offlineAlertCache: 'cache:offline-alerts',
  offlineLocationState: 'cache:offline-location-state',
  weather: 'cache:weather',
  airQuality: 'cache:air-quality',
  wildfire: 'cache:wildfire',
  water: 'cache:water',
  waterShapes: 'cache:water-shapes',
  vector: 'cache:vector',
  health: 'cache:health',
  predictions: 'cache:predictions',
  beach: 'cache:beach',
  openMeteo: 'cache:open-meteo',
  hydroOutages: 'cache:hydro-outages',
  mbReadyAlerts: 'cache:mb-ready-alerts',
} as const;

export const SAFETY_INDEX_WEIGHTS = {
  weather: 0.25,
  airQuality: 0.2,
  wildfire: 0.2,
  water: 0.15,
  vectorBorne: 0.1,
  healthAdvisories: 0.1,
} as const;

export const REFRESH_RETRY_DELAY_MS = 5000;
export const BACKGROUND_REFRESH_SECONDS = 60 * 30;
export const BACKGROUND_LOCATION_DISTANCE_METRES = 1500;
export const BACKGROUND_LOCATION_INTERVAL_MS = 3 * 60 * 1000;
export const OFFLINE_ALERT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_REGION_ID = 'winnipeg' as const;
export const PREDICTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const ALERT_PROXIMITY_KM = {
  wildfire: 300,
  water: 80,
  health: 120,
} as const;

export const MANITOBA_MAP_REGION = {
  latitude: 54.5,
  longitude: -97.0,
  latitudeDelta: 12.8,
  longitudeDelta: 13.5,
} as const;

export const AQHI_STATION_REGION_MAP = {
  winnipeg: 'Winnipeg',
  southern: 'Winnipeg',
  eastern: 'Winnipeg',
  western: 'Brandon',
  northern: 'Flin Flon',
} as const;

export const AQHI_STATIONS = [
  { name: 'Winnipeg', latitude: 49.8951, longitude: -97.1384 },
  { name: 'Brandon', latitude: 49.8485, longitude: -99.9501 },
  { name: 'Flin Flon', latitude: 54.7682, longitude: -101.8658 },
] as const;

export const LOCAL_AREA_TARGET_POPULATION = 10000;

export const MANITOBA_POPULATION_CENTERS = [
  { label: 'Winnipeg', regionId: 'winnipeg', latitude: 49.8951, longitude: -97.1384, density: 1400 },
  { label: 'Brandon', regionId: 'western', latitude: 49.8485, longitude: -99.9501, density: 420 },
  { label: 'Dauphin', regionId: 'western', latitude: 51.1498, longitude: -100.0501, density: 120 },
  { label: 'Swan River', regionId: 'western', latitude: 52.1049, longitude: -101.2676, density: 75 },
  { label: 'Steinbach', regionId: 'southern', latitude: 49.5258, longitude: -96.6845, density: 260 },
  { label: 'Portage la Prairie', regionId: 'southern', latitude: 49.9728, longitude: -98.2926, density: 180 },
  { label: 'Winkler', regionId: 'southern', latitude: 49.1817, longitude: -97.9394, density: 280 },
  { label: 'Selkirk', regionId: 'eastern', latitude: 50.1436, longitude: -96.8845, density: 220 },
  { label: 'Lac du Bonnet', regionId: 'eastern', latitude: 50.2536, longitude: -96.0615, density: 95 },
  { label: 'Thompson', regionId: 'northern', latitude: 55.7435, longitude: -97.8558, density: 120 },
  { label: 'The Pas', regionId: 'northern', latitude: 53.8254, longitude: -101.2541, density: 72 },
  { label: 'Flin Flon', regionId: 'northern', latitude: 54.7682, longitude: -101.8658, density: 62 },
  { label: 'Churchill', regionId: 'northern', latitude: 58.7684, longitude: -94.165, density: 18 },
] as const;

export const MANITOBA_REGIONS: readonly ManitobaRegion[] = [
  {
    id: 'winnipeg',
    label: 'Winnipeg Metro',
    shortLabel: 'WPG',
    description: 'Winnipeg Regional Health Authority footprint used as the metro routing boundary.',
    latitude: 49.8951,
    longitude: -97.1384,
    labelCoordinate: { latitude: 49.87, longitude: -97.11 },
    bounds: getPolygonBounds(OFFICIAL_RHA_POLYGONS.winnipeg),
    polygon: OFFICIAL_RHA_POLYGONS.winnipeg,
  },
  {
    id: 'southern',
    label: 'Southern MB',
    shortLabel: 'South',
    description: 'Southern Health-Sante Sud footprint for the south-central and southeast prairie corridor.',
    latitude: 49.8146,
    longitude: -97.8056,
    labelCoordinate: { latitude: 49.86, longitude: -97.15 },
    bounds: getPolygonBounds(OFFICIAL_RHA_POLYGONS.southern),
    polygon: OFFICIAL_RHA_POLYGONS.southern,
  },
  {
    id: 'eastern',
    label: 'Eastern MB',
    shortLabel: 'East',
    description: 'Interlake-Eastern boundary spanning the lower Red River, east shore, and Whiteshell side.',
    latitude: 50.1436,
    longitude: -96.8845,
    labelCoordinate: { latitude: 51.18, longitude: -96.1 },
    bounds: getPolygonBounds(OFFICIAL_RHA_POLYGONS.eastern),
    polygon: OFFICIAL_RHA_POLYGONS.eastern,
  },
  {
    id: 'western',
    label: 'Western MB',
    shortLabel: 'West',
    description: 'Prairie Mountain footprint covering Brandon, the Parkland, and the western border belt.',
    latitude: 50.8,
    longitude: -100.25,
    labelCoordinate: { latitude: 50.95, longitude: -100.05 },
    bounds: getPolygonBounds(OFFICIAL_RHA_POLYGONS.western),
    polygon: OFFICIAL_RHA_POLYGONS.western,
  },
  {
    id: 'northern',
    label: 'Northern MB',
    shortLabel: 'North',
    description: 'Northern health-region footprint spanning the boreal north and Hudson Bay coast.',
    latitude: 56.3,
    longitude: -95.55,
    labelCoordinate: { latitude: 56.1, longitude: -95.7 },
    bounds: getPolygonBounds(OFFICIAL_RHA_POLYGONS.northern),
    polygon: OFFICIAL_RHA_POLYGONS.northern,
  },
] as const;

export const REGION_PICKER_COPY: Record<(typeof MANITOBA_REGIONS)[number]['id'], string> = {
  winnipeg: 'Urban conditions, AQHI, and metro advisories.',
  southern: 'Agricultural prairie weather and water advisory coverage.',
  eastern: 'Lake country, ticks, and outdoor recreation exposure.',
  western: 'Fire weather and prairie storm exposure.',
  northern: 'Remote travel, smoke, and cold exposure across the north.',
};

export const CATEGORY_META: Record<
  CategoryId,
  { icon: string; label: string; shortLabel: string; summaryLabel: string }
> = {
  weather: { icon: 'weather-partly-cloudy', label: 'Weather', shortLabel: 'Weather', summaryLabel: 'Live weather' },
  airQuality: {
    icon: 'weather-windy',
    label: 'Air Quality',
    shortLabel: 'Air',
    summaryLabel: 'AQHI outlook',
  },
  wildfire: { icon: 'fire', label: 'Wildfire', shortLabel: 'Fire', summaryLabel: 'Wildfire pressure' },
  water: { icon: 'water', label: 'Water', shortLabel: 'Water', summaryLabel: 'Water advisories' },
  vectorBorne: {
    icon: 'ladybug',
    label: 'Vector-Borne',
    shortLabel: 'Vectors',
    summaryLabel: 'Vector seasonality',
  },
  healthAdvisories: {
    icon: 'medical-bag',
    label: 'Health Advisories',
    shortLabel: 'Health',
    summaryLabel: 'Public health bulletins',
  },
} as const;

export const DATA_SOURCE_META = [
  {
    name: 'Environment Canada weather pages',
    provides: 'Current conditions, warnings, and 7-day forecast outlooks',
    frequency: 'Hourly observations, daily forecast updates',
    url: API_URLS.weatherBase,
  },
  {
    name: 'Environment Canada AQHI XML',
    provides: 'Nearest AQHI observations for Manitoba stations',
    frequency: 'Hourly',
    url: API_URLS.aqhiIndex,
  },
  {
    name: 'Canadian Wildland Fire Information System',
    provides: 'Active wildfire coordinates and fire size',
    frequency: 'Updated throughout the day',
    url: API_URLS.wildfire,
  },
  {
    name: 'Manitoba drinking water advisories',
    provides: 'Boil water and drinking water avoidance advisories',
    frequency: 'Live ArcGIS layers',
    url: API_URLS.waterExperience,
  },
  {
    name: 'OpenStreetMap community mapping',
    provides: 'Building and park footprints used to tighten some site-specific water alert shapes',
    frequency: 'Queried on demand and cached locally',
    url: API_URLS.osmOverpass,
  },
  {
    name: 'Manitoba tick-borne disease guidance',
    provides: 'Seasonal vector context and public guidance',
    frequency: 'Reference guidance, model refreshed daily',
    url: API_URLS.vectorTick,
  },
  {
    name: 'Manitoba Public Health',
    provides: 'Bulletins, advisories, and outbreak headlines',
    frequency: 'Checked on each app refresh',
    url: API_URLS.healthPublic,
  },
] as const;

export const ONBOARDING_SLIDES = [
  {
    id: 'score',
    emoji: '🛡️',
    title: 'One Score. All Risks.',
    description: 'MOSI blends weather, smoke, wildfire, water, vector, and health signals into one daily read.',
  },
  {
    id: 'manitoba',
    emoji: '🌲',
    title: 'Built for Manitoba',
    description: 'Northern travel, prairie storms, smoke, and local advisories all matter differently here.',
  },
  {
    id: 'predictive',
    emoji: '📈',
    title: 'Predictive, Not Just Reactive',
    description: 'Forecast-informed outlooks show where risk may build next, not just where it already is.',
  },
] as const;
