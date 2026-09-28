import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePreferencesStore } from '../state/usePreferencesStore';

function enabled() {
  return Platform.OS !== 'web' && usePreferencesStore.getState().hapticsEnabled;
}

export function tapHaptic() {
  if (enabled()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function selectHaptic() {
  if (enabled()) void Haptics.selectionAsync().catch(() => undefined);
}

export function successHaptic() {
  if (enabled()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
