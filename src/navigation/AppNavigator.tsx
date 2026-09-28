import React, { useMemo } from 'react';
import { View } from 'react-native';
import { NavigationContainer, Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AboutScreen } from '../screens/AboutScreen';
import { AlertDetailScreen } from '../screens/AlertDetailScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { MapScreen } from '../screens/MapScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { buildVisibleAlerts } from '../services/alert-feed-service';
import { useAppStore } from '../state/useAppStore';
import { AlertDetail } from '../types/alerts';
import { useAppTheme } from '../theme';
import { selectHaptic } from '../utils/haptics';
import { Text } from '../components/ui/Text';
import { withScreenBoundary } from '../components/ScreenErrorBoundary';

const SafeOverview = withScreenBoundary(OverviewScreen);
const SafeMap = withScreenBoundary(MapScreen, "The map couldn't load");
const SafeAlerts = withScreenBoundary(AlertsScreen);
const SafeInsights = withScreenBoundary(InsightsScreen);
const SafeAbout = withScreenBoundary(AboutScreen);

export type RootStackParamList = {
  Tabs: undefined;
  AlertDetail: { alert: AlertDetail };
  Legal: { doc: 'privacy' | 'terms' };
};

type TabParamList = {
  Overview: undefined;
  Map: undefined;
  Alerts: undefined;
  Insights: undefined;
  About: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_CONFIG: Record<
  keyof TabParamList,
  { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; activeIcon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  Overview: { label: 'Today', icon: 'gauge-low', activeIcon: 'gauge' },
  Map: { label: 'Map', icon: 'map-outline', activeIcon: 'map' },
  Alerts: { label: 'Alerts', icon: 'bell-outline', activeIcon: 'bell' },
  Insights: { label: 'Outlook', icon: 'calendar-week-outline', activeIcon: 'calendar-week' },
  About: { label: 'Settings', icon: 'cog-outline', activeIcon: 'cog' },
};

/** Number of high-risk alerts relevant to the user's area, shown as a tab badge. */
function useHighAlertCount() {
  const regionId = useAppStore((s) => s.selectedRegionId);
  const snapshots = useAppStore((s) => s.snapshots);
  const selectedAreaSnapshot = useAppStore((s) => s.selectedAreaSnapshot);
  const selectedAreaAlertDetails = useAppStore((s) => s.selectedAreaAlertDetails);
  const locationSource = useAppStore((s) => s.locationSource);
  const userCoordinates = useAppStore((s) => s.userCoordinates);
  const snapshot = selectedAreaSnapshot ?? snapshots[regionId];

  return useMemo(() => {
    if (!snapshot) return 0;
    return buildVisibleAlerts({
      snapshot,
      rawAlertDetails: selectedAreaAlertDetails,
      selectedFilter: 'all',
      locationSource,
      userCoordinates,
    }).filter((alert) => alert.riskLevel === 'high').length;
  }, [locationSource, selectedAreaAlertDetails, snapshot, userCoordinates]);
}

function Tabs() {
  const theme = useAppTheme();
  const { colors: c } = theme;
  const highAlertCount = useHighAlertCount();
  // Includes the gesture/nav bar inset so the bar stays clear of it on edge-to-edge Android.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => selectHaptic() }}
      screenOptions={({ route }) => {
        const config = TAB_CONFIG[route.name as keyof TabParamList];
        return {
          headerShown: false,
          tabBarActiveTintColor: c.text,
          tabBarInactiveTintColor: c.textSoft,
          tabBarStyle: {
            height: 64 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom + 8,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.card,
            elevation: 0,
          },
          tabBarLabel: ({ focused, color }) => (
            <Text style={{ fontFamily: focused ? 'Body-700' : 'Body-500', fontSize: 11, color, marginTop: 2 }}>
              {config.label}
            </Text>
          ),
          tabBarIcon: ({ focused, color }) => (
            <View
              style={{
                width: 54,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? c.primarySoft : 'transparent',
              }}
            >
              <MaterialCommunityIcons
                name={focused ? config.activeIcon : config.icon}
                size={22}
                color={focused ? c.primary : color}
              />
            </View>
          ),
          tabBarAccessibilityLabel: config.label,
          sceneStyle: {
            backgroundColor: c.background,
          },
        };
      }}
    >
      <Tab.Screen name="Overview" component={SafeOverview} />
      <Tab.Screen name="Map" component={SafeMap} />
      <Tab.Screen
        name="Alerts"
        component={SafeAlerts}
        options={{
          tabBarBadge: highAlertCount > 0 ? highAlertCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.riskHigh, color: '#FFFFFF', fontFamily: 'Body-700', fontSize: 11 },
        }}
      />
      <Tab.Screen name="Insights" component={SafeInsights} />
      <Tab.Screen name="About" component={SafeAbout} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const theme = useAppTheme();

  const navigationTheme: NavigationTheme = {
    dark: theme.isDark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.card,
      text: theme.colors.text,
      border: 'transparent',
      notification: theme.colors.riskHigh,
    },
    fonts: {
      regular: { fontFamily: 'Body-400', fontWeight: '400' },
      medium: { fontFamily: 'Body-500', fontWeight: '500' },
      bold: { fontFamily: 'Body-700', fontWeight: '700' },
      heavy: { fontFamily: 'Body-800', fontWeight: '800' },
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerLargeTitle: false,
          headerTintColor: theme.colors.text,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTitleStyle: { fontFamily: 'Body-700', fontSize: 17 },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="AlertDetail"
          component={AlertDetailScreen}
          options={{
            presentation: 'modal',
            title: 'Alert details',
          }}
        />
        <Stack.Screen
          name="Legal"
          component={LegalScreen}
          options={({ route }) => ({
            title: route.params.doc === 'privacy' ? 'Privacy Policy' : 'Terms of Use',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
