import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

type PreferencesState = {
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  setThemePreference: (preference: ThemePreference) => void;
  setHapticsEnabled: (enabled: boolean) => void;
};

/**
 * Kept separate from the app store so the theme layer can read it without
 * importing the data services (which would create an import cycle).
 */
export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      hapticsEnabled: true,
      notificationsEnabled: false,
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'mosi-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ themePreference, hapticsEnabled, notificationsEnabled }) => ({
        themePreference,
        hapticsEnabled,
        notificationsEnabled,
      }),
    },
  ),
);
