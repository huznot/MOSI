import { CategoryId, ManitobaRegion } from '../types/alerts';
import { OFFICIAL_RHA_POLYGONS, getPolygonBounds } from '../data/manitobaGeometry';

export const API_URLS = {
  weatherBase: 'https://weather.gc.ca/en/location/index.html',
  aqhiIndex: 'https://dd.weather.gc.ca/today/air_quality/aqhi/pnr/observation/realtime/xml/',
  // Only fires whose record is current (record_start <= now <= record_end), in lat/lon.
  wildfire:
    'https://geoserver.cwfif.nrcan.gc.ca/geoserver/wfs?service=WFS&version=2.0.1&request=GetFeature&outputFormat=application/json&typeName=public:cwfif_national_activefires&srsName=EPSG:4326&CQL_FILTER=now()%3E=record_start%20AND%20now()%3C=record_end',
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
  notificationRegion: 'mosi-notification-region',
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

// A quick second attempt catches blips; a long pause only made failures feel slow.
export const REFRESH_RETRY_DELAY_MS = 600;
export const BACKGROUND_REFRESH_SECONDS = 60 * 30;
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

export const LICENCES = {
  oglCanada: 'Open Government Licence – Canada',
  oglManitoba: 'Open Government Licence – Manitoba',
  ccBy4: 'CC BY 4.0',
  odbl: 'ODbL (© OpenStreetMap contributors)',
} as const;

export const DATA_SOURCE_META = [
  {
    name: 'Environment and Climate Change Canada',
    provides: 'Current conditions and weather warnings',
    frequency: 'Hourly observations',
    licence: LICENCES.oglCanada,
    url: 'https://weather.gc.ca/',
  },
  {
    name: 'ECCC Air Quality Health Index',
    provides: 'AQHI readings from the nearest Manitoba station',
    frequency: 'Hourly',
    licence: LICENCES.oglCanada,
    url: 'https://weather.gc.ca/airquality/pages/provincial_summary/mb_e.html',
  },
  {
    name: 'Canadian Wildland Fire Information System',
    provides: 'Active wildfire locations and sizes',
    frequency: 'Several times a day',
    licence: LICENCES.oglCanada,
    url: 'https://cwfis.cfs.nrcan.gc.ca/interactive-map',
  },
  {
    name: 'Manitoba drinking water advisories',
    provides: 'Boil water and do-not-consume advisories',
    frequency: 'Live provincial map layers',
    licence: LICENCES.oglManitoba,
    url: 'https://www.gov.mb.ca/sd/water/drinking-water/advisory/index.html',
  },
  {
    name: 'Manitoba beach water quality monitoring',
    provides: 'E. coli and algal bloom sample results at public beaches',
    frequency: 'Weekly in beach season',
    licence: LICENCES.oglManitoba,
    url: 'https://www.gov.mb.ca/sd/water/lakes-beaches-rivers/manitoba-beaches.html',
  },
  {
    name: 'Manitoba Health: public health notices',
    provides: 'Public health bulletins and advisories',
    frequency: 'Checked on each refresh',
    licence: LICENCES.oglManitoba,
    url: 'https://www.gov.mb.ca/health/publichealth/',
  },
  {
    name: 'Manitoba Health: tick-borne diseases',
    provides: 'Tick season guidance used in the tick and mosquito estimate',
    frequency: 'Reference guidance',
    licence: LICENCES.oglManitoba,
    url: 'https://www.gov.mb.ca/health/publichealth/cdc/tickborne/index.html',
  },
  {
    name: 'Manitoba Health: West Nile virus',
    provides: 'Mosquito and West Nile virus guidance used in the tick and mosquito estimate',
    frequency: 'Reference guidance',
    licence: LICENCES.oglManitoba,
    url: 'https://www.gov.mb.ca/health/wnv/index.html',
  },
  {
    name: 'Alert Ready (National Public Alerting System, via NAAD)',
    provides: 'Public emergency alerts issued for Manitoba (Alert Ready)',
    frequency: 'Checked every 10 minutes while open',
    licence: 'Pelmorex NAAD public feed',
    url: 'https://www.alertready.ca/',
  },
  {
    name: 'Manitoba Hydro',
    provides: 'Current power outage areas (map only)',
    frequency: 'Checked on each refresh',
    licence: 'Public outage map data',
    url: 'https://www.hydro.mb.ca/outages/',
  },
  {
    name: 'Open-Meteo',
    provides: '7-day forecast inputs for the outlook tab',
    frequency: 'Every 6 hours',
    licence: LICENCES.ccBy4,
    url: 'https://open-meteo.com/',
  },
  {
    name: 'OpenStreetMap',
    provides: 'Building and park outlines used to draw some water advisory areas',
    frequency: 'On demand, cached',
    licence: LICENCES.odbl,
    url: 'https://www.openstreetmap.org/copyright',
  },
] as const;
