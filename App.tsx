import React, { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { AppSplash } from './src/components/app-splash';
import { OnboardingFlow } from './src/components/onboarding-flow';
import { RegionPickerModal } from './src/components/region-picker-modal';
import { useAppStore } from './src/state/useAppStore';
import { ThemeProvider, useAppTheme } from './src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppShell() {
  const theme = useAppTheme();
  const isHydrated = useAppStore((state) => state.isHydrated);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const hasCompletedOnboarding = useAppStore((state) => state.hasCompletedOnboarding);
  const showRegionPicker = useAppStore((state) => state.showRegionPicker);
  const initialize = useAppStore((state) => state.initialize);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const setSelectedZone = useAppStore((state) => state.setSelectedZone);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);

  useEffect(() => {
    if (isHydrated && !isInitialized) {
      void initialize();
    }
  }, [initialize, isHydrated, isInitialized]);

  useEffect(() => {
    if (!isHydrated || !isInitialized) {
      return;
    }

    void SplashScreen.hideAsync().catch(() => undefined);

    const timeout = setTimeout(() => {
      setShowSplashOverlay(false);
    }, 650);

    return () => clearTimeout(timeout);
  }, [isHydrated, isInitialized]);

  if (!isHydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaProvider>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <AppNavigator />
          {showSplashOverlay ? <AppSplash /> : null}
          {!hasCompletedOnboarding ? <OnboardingFlow onDone={completeOnboarding} /> : null}
          {hasCompletedOnboarding && showRegionPicker ? <RegionPickerModal onSelect={setSelectedZone} /> : null}
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
