import React, { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { AppSplash } from './src/components/app-splash';
import { OnboardingFlow } from './src/components/onboarding-flow';
import { RegionPickerModal } from './src/components/region-picker-modal';
import { useAppStore } from './src/state/useAppStore';
import { FONT_ASSETS, ThemeProvider, useAppTheme } from './src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// The branded overlay never blocks the app for longer than this, even on a slow network;
// screens show their own skeletons while the first refresh finishes.
const MAX_SPLASH_MS = 2200;

function AppShell() {
  const theme = useAppTheme();
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const hasCompletedOnboarding = useAppStore((state) => state.hasCompletedOnboarding);
  const showRegionPicker = useAppStore((state) => state.showRegionPicker);
  const initialize = useAppStore((state) => state.initialize);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const setSelectedZone = useAppStore((state) => state.setSelectedZone);
  const dismissRegionPicker = useAppStore((state) => state.dismissRegionPicker);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const isReady = isHydrated && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (isHydrated && hasCompletedOnboarding && !isInitialized) {
      void initialize();
    }
  }, [hasCompletedOnboarding, initialize, isHydrated, isInitialized]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void SplashScreen.hideAsync().catch(() => undefined);

    if (!hasCompletedOnboarding) {
      setShowSplashOverlay(false);
      return;
    }

    const timeout = setTimeout(() => setShowSplashOverlay(false), isInitialized ? 450 : MAX_SPLASH_MS);
    return () => clearTimeout(timeout);
  }, [hasCompletedOnboarding, isInitialized, isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaProvider>
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.colors.background}
        />
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          {hasCompletedOnboarding ? <AppNavigator /> : null}
          {hasCompletedOnboarding && showSplashOverlay ? <AppSplash /> : null}
          {!hasCompletedOnboarding ? <OnboardingFlow onDone={completeOnboarding} /> : null}
          {hasCompletedOnboarding && showRegionPicker ? (
            <RegionPickerModal onSelect={setSelectedZone} onClose={dismissRegionPicker} />
          ) : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Render the root Expo application shell after persisted state is ready. */
export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
