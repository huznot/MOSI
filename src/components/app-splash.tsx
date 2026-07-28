import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { STRINGS } from '../constants/strings';
import { useAppTheme } from '../theme';

export function AppSplash() {
  const theme = useAppTheme();

  return (
    <Animated.View
      exiting={FadeOut.duration(500)}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 28,
          backgroundColor: 'rgba(255,255,255,0.14)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name="shield-check" size={42} color={theme.colors.textOnPrimary} />
      </View>
      <Text style={{ ...theme.typography.display, color: theme.colors.textOnPrimary }}>MOSI</Text>
      <Text style={{ ...theme.typography.body, color: 'rgba(255,255,255,0.78)' }}>{STRINGS.appTagline}</Text>
    </Animated.View>
  );
}
