import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type * as BackgroundFetchModule from 'expo-background-fetch';
import type * as NotificationsModule from 'expo-notifications';
import type * as TaskManagerModule from 'expo-task-manager';

import { BACKGROUND_REFRESH_SECONDS, CATEGORY_META, STORAGE_KEYS } from '../constants/config';
import { CategoryId, RegionId, RegionSnapshot } from '../types/alerts';
import { refreshAllRegionData } from './alertAggregator';
import { getRegionById } from './locationService';

const BACKGROUND_TASK_NAME = 'manitoba-outdoor-safety-background-check';
const ANDROID_CHANNEL_ID = 'risk-alerts';

/**
 * Expo Go no longer ships the notification / background-fetch native modules, and
 * importing them there crashes the app on launch. They are only loaded in real builds.
 */
export const notificationsSupported =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type NativeModules = {
  Notifications: typeof NotificationsModule;
  BackgroundFetch: typeof BackgroundFetchModule;
  TaskManager: typeof TaskManagerModule;
};

let nativeModules: NativeModules | null = null;

function getNativeModules(): NativeModules | null {
  if (!notificationsSupported) return null;
  if (!nativeModules) {
    nativeModules = {
      Notifications: require('expo-notifications'),
      BackgroundFetch: require('expo-background-fetch'),
      TaskManager: require('expo-task-manager'),
    };
  }
  return nativeModules;
}

/** Categories currently at HIGH for one region, keyed by category. */
export function getHighRiskState(snapshot: RegionSnapshot) {
  return (Object.entries(snapshot.alerts) as [CategoryId, RegionSnapshot['alerts'][CategoryId]][]).reduce<
    Record<string, string>
  >((accumulator, [category, alert]) => {
    if (alert.riskLevel === 'high' && alert.dataStatus !== 'unavailable') {
      accumulator[category] = alert.summary;
    }
    return accumulator;
  }, {});
}

/**
 * Remembers which broad region the user is following so the background check only
 * notifies about their own area. Only the region id is stored - never coordinates.
 */
export async function setNotificationRegion(regionId: RegionId) {
  await AsyncStorage.setItem(STORAGE_KEYS.notificationRegion, regionId).catch(() => undefined);
}

async function runBackgroundCheck(modules: NativeModules) {
  const { BackgroundFetch, Notifications } = modules;
  try {
    const storedRegion = (await AsyncStorage.getItem(STORAGE_KEYS.notificationRegion)) as RegionId | null;
    const regionId = storedRegion ?? 'winnipeg';
    const { snapshots } = await refreshAllRegionData(null, null, regionId);
    const snapshot = snapshots[regionId];
    if (!snapshot) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const nextHighRiskState = getHighRiskState(snapshot);
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.notifications);
    const previous = raw ? (JSON.parse(raw) as { regionId?: string; state?: Record<string, string> }) : {};
    const previousState = previous.regionId === regionId ? previous.state ?? {} : {};
    const newlyHigh = Object.entries(nextHighRiskState).filter(([category]) => !previousState[category]);

    await AsyncStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify({ regionId, state: nextHighRiskState }));

    const regionLabel = getRegionById(regionId).label;
    await Promise.all(
      newlyHigh.map(([category, summary]) =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${CATEGORY_META[category as CategoryId]?.label ?? 'Outdoor'} risk is high in ${regionLabel}`,
            body: `${summary} Open MOSI and check official sources before heading out.`,
          },
          trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
        }),
      ),
    );

    return newlyHigh.length
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

// Background tasks must be defined when the JS bundle loads, so this runs at import time
// in real builds (and is skipped entirely in Expo Go).
(() => {
  const modules = getNativeModules();
  if (!modules) return;

  modules.Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  modules.TaskManager.defineTask(BACKGROUND_TASK_NAME, () => runBackgroundCheck(modules));
})();

export async function getNotificationPermissionGranted() {
  const modules = getNativeModules();
  if (!modules) return false;
  const permissions = await modules.Notifications.getPermissionsAsync().catch(() => null);
  return permissions?.status === 'granted';
}

/**
 * Asks for notification permission (only ever called from an explicit user action)
 * and schedules the periodic background check. Returns whether alerts are active.
 */
export async function enableRiskNotifications() {
  const modules = getNativeModules();
  if (!modules) return false;
  const { BackgroundFetch, Notifications, TaskManager } = modules;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'High-risk alerts',
      description: 'Sent when a category in your area turns high risk.',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return false;
  }

  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME).catch(() => false);
  if (!registered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: BACKGROUND_REFRESH_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    }).catch(() => undefined);
  }
  return true;
}

export async function disableRiskNotifications() {
  const modules = getNativeModules();
  if (modules) {
    const registered = await modules.TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME).catch(() => false);
    if (registered) {
      await modules.BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME).catch(() => undefined);
    }
  }
  await AsyncStorage.removeItem(STORAGE_KEYS.notifications).catch(() => undefined);
}
