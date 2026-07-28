import React from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer, Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AlertDetailScreen } from '../screens/AlertDetailScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { MapScreen } from '../screens/MapScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { AlertDetail } from '../types/alerts';
import { useAppTheme } from '../theme';

export type RootStackParamList = {
  Tabs: undefined;
  AlertDetail: { alert: AlertDetail };
};

type TabParamList = {
  Overview: undefined;
  Map: undefined;
  Alerts: undefined;
  Insights: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const iconMap: Record<keyof TabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Overview: 'view-dashboard-outline',
  Map: 'map-marker-radius-outline',
  Alerts: 'bell-outline',
  Insights: 'weather-partly-cloudy',
};

const tabLabels: Record<keyof TabParamList, string> = {
  Overview: 'Dashboard',
  Map: 'Map',
  Alerts: 'Alerts',
  Insights: 'Forecast',
};

function Tabs() {
  const theme = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.divider,
          backgroundColor: theme.colors.card,
        },
        tabBarLabel: ({ color }) => (
          <Text
            style={{
              ...theme.typography.caption,
              color,
            }}
          >
            {tabLabels[route.name as keyof TabParamList]}
          </Text>
        ),
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={iconMap[route.name as keyof TabParamList]} size={size} color={color} />
        ),
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      })}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
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
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
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
          headerTitleStyle: theme.typography.title,
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
            title: 'Alert Details',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
