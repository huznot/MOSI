import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  ALERT_PROXIMITY_KM,
  BACKGROUND_LOCATION_DISTANCE_METRES,
  BACKGROUND_LOCATION_INTERVAL_MS,
  BACKGROUND_REFRESH_SECONDS,
  CATEGORY_META,
  OFFLINE_ALERT_CACHE_MAX_AGE_MS,
  STORAGE_KEYS,
} from '../constants/config';
import { STRINGS } from '../constants/strings';
import {
  AlertDetail,
  CategoryAlert,
  CategoryId,
  RegionId,
  RegionSnapshot,
  RiskLevel,
  UserCoordinates,
} from '../types/alerts';
import { formatRelativeMinutes } from '../utils/format';
import { refreshAllRegionData } from './alertAggregator';
import { getDistanceKm, getRegionById, getRegionFromCoordinates } from './locationService';
import { waterAreaContainsPoint } from './waterAdvisoryService';

const BACKGROUND_TASK_NAME = 'manitoba-outdoor-safety-background-check';
const BACKGROUND_LOCATION_TASK_NAME = 'manitoba-outdoor-safety-location-monitor';
const SUMMARY_NOTIFICATION_CATEGORIES: readonly CategoryId[] = ['weather', 'airQuality', 'vectorBorne'];
const ANDROID_LOCATION_SERVICE_TITLE = 'MOSI travel monitoring';
const ANDROID_LOCATION_SERVICE_BODY =
  'MOSI compares last synced alerts with your location while you travel.';

type CachedRegionAlerts = Record<
  RegionId,
  {
    fetchedAt: string;
    alerts: RegionSnapshot['alerts'];
  }
>;

type OfflineAlertCache = {
  cachedAt: string;
  regions: CachedRegionAlerts;
  rawAlertDetails: AlertDetail[];
  mapLocationAlerts: AlertDetail[];
};

type OfflineLocationMonitorState = {
  activeKeys: string[];
  lastRegionId: RegionId | null;
  cacheAt: string | null;
};

type OfflineNotificationCandidate = {
  key: string;
  category: CategoryId;
  riskLevel: RiskLevel;
  title: string;
  body: string;
};

const severityOrder: Record<RiskLevel, number> = {
  high: 0,
  moderate: 1,
  low: 2,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getCacheAgeLabel(cachedAt: string) {
  const relative = formatRelativeMinutes(cachedAt);
  return relative === 'Unavailable' ? 'last sync unavailable' : `last synced ${relative}`;
}

function clipText(value: string, maxLength = 110) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function isOfflineAlertCacheFresh(cachedAt: string) {
  const parsed = new Date(cachedAt).getTime();
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return Date.now() - parsed <= OFFLINE_ALERT_CACHE_MAX_AGE_MS;
}

function buildOfflineRegionCache(snapshots: Record<string, RegionSnapshot>) {
  return Object.values(snapshots).reduce((accumulator, snapshot) => {
    accumulator[snapshot.region.id] = {
      fetchedAt: snapshot.fetchedAt,
      alerts: snapshot.alerts,
    };
    return accumulator;
  }, {} as CachedRegionAlerts);
}

function buildOfflineLocationState(activeKeys: string[], lastRegionId: RegionId | null, cacheAt: string | null) {
  return {
    activeKeys,
    lastRegionId,
    cacheAt,
  } satisfies OfflineLocationMonitorState;
}

async function readOfflineAlertCache() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.offlineAlertCache);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as OfflineAlertCache;
    if (!parsed || typeof parsed.cachedAt !== 'string') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function readOfflineLocationState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.offlineLocationState);
    if (!raw) {
      return buildOfflineLocationState([], null, null);
    }

    const parsed = JSON.parse(raw) as Partial<OfflineLocationMonitorState>;
    return buildOfflineLocationState(
      Array.isArray(parsed.activeKeys) ? parsed.activeKeys.filter((value): value is string => typeof value === 'string') : [],
      parsed.lastRegionId ?? null,
      parsed.cacheAt ?? null,
    );
  } catch {
    return buildOfflineLocationState([], null, null);
  }
}

async function writeOfflineLocationState(state: OfflineLocationMonitorState) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.offlineLocationState, JSON.stringify(state));
  } catch {

  }
}

function buildDetailCandidate(alert: AlertDetail, cachedAt: string): OfflineNotificationCandidate {
  const cacheLabel = getCacheAgeLabel(cachedAt);

  if (alert.category === 'water') {
    return {
      key: `detail:${alert.id}`,
      category: alert.category,
      riskLevel: alert.riskLevel,
      title: 'Possible water advisory nearby',
      body: `${cacheLabel}, ${alert.title} may still be under a water advisory near your current location. Reconnect to confirm.`,
    };
  }

  if (alert.category === 'wildfire') {
    return {
      key: `detail:${alert.id}`,
      category: alert.category,
      riskLevel: alert.riskLevel,
      title: 'Possible wildfire risk nearby',
      body: `${cacheLabel}, ${alert.title} may still be affecting your current area. Reconnect to verify current fire or smoke conditions.`,
    };
  }

  return {
    key: `detail:${alert.id}`,
    category: alert.category,
    riskLevel: alert.riskLevel,
    title: 'Possible health advisory nearby',
    body: `${cacheLabel}, ${clipText(alert.title, 96)} may still apply in your current region. Reconnect to confirm the latest guidance.`,
  };
}

function buildSummaryCandidate(
  regionId: RegionId,
  category: CategoryId,
  alert: CategoryAlert,
  cachedAt: string,
): OfflineNotificationCandidate {
  const cacheLabel = getCacheAgeLabel(cachedAt);
  const regionLabel = getRegionById(regionId).label;
  const categoryLabel = CATEGORY_META[category].label;

  return {
    key: `summary:${regionId}:${category}`,
    category,
    riskLevel: alert.riskLevel,
    title: `Possible ${categoryLabel.toLowerCase()} risk nearby`,
    body: `${cacheLabel}, ${categoryLabel} in ${regionLabel} was ${alert.riskLevel}. ${clipText(alert.summary, 88)} Reconnect to verify current conditions.`,
  };
}

function isOfflineDetailRelevant(
  alert: AlertDetail,
  userCoordinates: UserCoordinates,
  regionId: RegionId,
) {
  if (alert.riskLevel === 'low') {
    return false;
  }

  if (alert.category === 'water' && alert.coordinates) {
    return alert.impactRadiusMetres
      ? waterAreaContainsPoint(
          alert as AlertDetail & { coordinates: NonNullable<AlertDetail['coordinates']> },
          userCoordinates,
        )
      : getDistanceKm(
          userCoordinates.latitude,
          userCoordinates.longitude,
          alert.coordinates.latitude,
          alert.coordinates.longitude,
        ) <= ALERT_PROXIMITY_KM.water;
  }

  if (alert.category === 'wildfire' && alert.coordinates) {
    return (
      getDistanceKm(
        userCoordinates.latitude,
        userCoordinates.longitude,
        alert.coordinates.latitude,
        alert.coordinates.longitude,
      ) <= ALERT_PROXIMITY_KM.wildfire
    );
  }

  if (alert.category === 'healthAdvisories') {
    return alert.regionIds.includes(regionId);
  }

  return false;
}

function shouldNotifySummaryAlert(category: CategoryId, alert: CategoryAlert) {
  if (alert.riskLevel === 'high') {
    return true;
  }

  if (category === 'weather') {
    return /warning|watch|advisory|alert/i.test(alert.summary);
  }

  if (category === 'airQuality') {
    return /smoke|aqhi|air quality/i.test(alert.summary) && alert.riskLevel !== 'low';
  }

  return false;
}

function collectOfflineNotificationCandidates(cache: OfflineAlertCache, userCoordinates: UserCoordinates) {
  const regionId = getRegionFromCoordinates(userCoordinates.latitude, userCoordinates.longitude).id;
  const detailAlerts = [
    ...cache.mapLocationAlerts.filter((alert) => alert.category === 'water'),
    ...cache.rawAlertDetails.filter((alert) => alert.category !== 'water'),
  ];
  const detailCandidates = detailAlerts
    .filter((alert) => isOfflineDetailRelevant(alert, userCoordinates, regionId))
    .map((alert) => buildDetailCandidate(alert, cache.cachedAt));
  const regionAlerts = cache.regions[regionId]?.alerts;
  const summaryCandidates =
    regionAlerts === undefined
      ? []
      : SUMMARY_NOTIFICATION_CATEGORIES
          .map((category) => ({ category, alert: regionAlerts[category] }))
          .filter(({ category, alert }) => shouldNotifySummaryAlert(category, alert))
          .map(({ category, alert }) => buildSummaryCandidate(regionId, category, alert, cache.cachedAt));

  return [...detailCandidates, ...summaryCandidates].sort(
    (left, right) => severityOrder[left.riskLevel] - severityOrder[right.riskLevel],
  );
}

async function scheduleOfflineLocationNotification(
  candidates: OfflineNotificationCandidate[],
  cachedAt: string,
) {
  if (!candidates.length) {
    return;
  }

  const content =
    candidates.length === 1
      ? {
          title: candidates[0].title,
          body: candidates[0].body,
        }
      : {
          title: 'Multiple cached MOSI alerts nearby',
          body: `${getCacheAgeLabel(cachedAt)}, ${candidates.length} cached alerts may still affect your current area. Reconnect to verify current conditions.`,
        };

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}

async function evaluateOfflineAlertCacheForLocation(
  userCoordinates: UserCoordinates,
  sendNotifications: boolean,
) {
  const [cache, previousState] = await Promise.all([readOfflineAlertCache(), readOfflineLocationState()]);
  const currentRegionId = getRegionFromCoordinates(userCoordinates.latitude, userCoordinates.longitude).id;

  if (!cache || !isOfflineAlertCacheFresh(cache.cachedAt)) {
    await writeOfflineLocationState(buildOfflineLocationState([], currentRegionId, cache?.cachedAt ?? null));
    return;
  }

  const candidates = collectOfflineNotificationCandidates(cache, userCoordinates);
  const nextKeys = candidates.map((candidate) => candidate.key);
  const previousKeys = new Set(previousState.activeKeys);
  const newlyRelevant = sendNotifications
    ? candidates.filter((candidate) => !previousKeys.has(candidate.key))
    : [];

  await writeOfflineLocationState(buildOfflineLocationState(nextKeys, currentRegionId, cache.cachedAt));

  if (sendNotifications && newlyRelevant.length) {
    await scheduleOfflineLocationNotification(newlyRelevant, cache.cachedAt);
  }
}

async function syncOfflineLocationMonitoring(notificationsGranted: boolean) {
  if (Platform.OS === 'web') {
    return;
  }

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME).catch(() => false);
  if (!notificationsGranted) {
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME).catch(() => undefined);
    }
    return;
  }

  const backgroundLocationAvailable = await Location.isBackgroundLocationAvailableAsync().catch(() => false);
  if (!backgroundLocationAvailable) {
    return;
  }

  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  if (foregroundPermission.status !== 'granted') {
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME).catch(() => undefined);
    }
    return;
  }

  let backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (backgroundPermission.status !== 'granted') {
    backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  }

  if (backgroundPermission.status !== 'granted') {
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME).catch(() => undefined);
    }
    return;
  }

  if (hasStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: BACKGROUND_LOCATION_DISTANCE_METRES,
    timeInterval: BACKGROUND_LOCATION_INTERVAL_MS,
    deferredUpdatesDistance: BACKGROUND_LOCATION_DISTANCE_METRES,
    deferredUpdatesInterval: BACKGROUND_LOCATION_INTERVAL_MS,
    foregroundService: {
      notificationTitle: ANDROID_LOCATION_SERVICE_TITLE,
      notificationBody: ANDROID_LOCATION_SERVICE_BODY,
      notificationColor: '#2D6A4F',
    },
  }).catch(() => undefined);
}

export function getHighRiskState(snapshots: Record<string, RegionSnapshot>) {
  return Object.values(snapshots).reduce<Record<string, string>>((accumulator, snapshot) => {
    (Object.entries(snapshot.alerts) as [CategoryId, RegionSnapshot['alerts'][CategoryId]][]).forEach(([category, alert]) => {
      if (alert.riskLevel === 'high') {
        accumulator[`${snapshot.region.id}:${category}`] = alert.summary;
      }
    });

    return accumulator;
  }, {});
}

export async function cacheOfflineAlertPayload(
  snapshots: Record<string, RegionSnapshot>,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
) {
  const payload = {
    cachedAt: new Date().toISOString(),
    regions: buildOfflineRegionCache(snapshots),
    rawAlertDetails: rawAlertDetails.filter((alert) => alert.category !== 'water'),
    mapLocationAlerts: mapLocationAlerts.filter((alert) => alert.category === 'water'),
  } satisfies OfflineAlertCache;

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.offlineAlertCache, JSON.stringify(payload));
  } catch {

  }
}

export async function primeOfflineLocationMonitor(userCoordinates: UserCoordinates | null) {
  if (!userCoordinates) {
    return;
  }

  await evaluateOfflineAlertCacheForLocation(userCoordinates, false).catch(() => undefined);
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const { snapshots, alertDetails, mapLocationAlerts } = await refreshAllRegionData();
    await cacheOfflineAlertPayload(snapshots, alertDetails, mapLocationAlerts);

    const nextHighRiskState = getHighRiskState(snapshots);
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.notifications);
    const previousHighRiskState = raw ? (JSON.parse(raw) as Record<string, string>) : {};

    const newlyHigh = Object.entries(nextHighRiskState).filter(([key]) => !previousHighRiskState[key]);
    await AsyncStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(nextHighRiskState));

    await Promise.all(
      newlyHigh.map(async ([key, summary]) => {
        const category = key.split(':')[1];
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Alert: ${STRINGS.notificationTitle}`,
            body: `${category} risk is now HIGH. ${summary}`,
          },
          trigger: null,
        });
      }),
    );

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  const locations = ((data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? []).filter(
    (location): location is Location.LocationObject => Boolean(location?.coords),
  );
  const latest = locations[locations.length - 1];

  if (!latest?.coords) {
    return;
  }

  await evaluateOfflineAlertCacheForLocation(
    {
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      accuracy: latest.coords.accuracy,
      timestamp: new Date(latest.timestamp).toISOString(),
    },
    true,
  ).catch(() => undefined);
});

export async function registerNotifications() {
  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;

  if (status !== 'granted') {
    const request = await Notifications.requestPermissionsAsync();
    status = request.status;
  }

  if (status === 'granted' && Platform.OS !== 'web') {
    await Notifications.getExpoPushTokenAsync().catch(() => undefined);
  }

  await syncOfflineLocationMonitoring(status === 'granted');

  const existing = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (!existing) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: BACKGROUND_REFRESH_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}
