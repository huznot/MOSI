import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useAppTheme } from '../theme';
import { BrandMark } from './ui/BrandMark';
import { Text } from './ui/Text';

export function AppSplash() {
  const theme = useAppTheme();

  return (
    <Animated.View
      exiting={FadeOut.duration(380)}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
      }}
    >
      <Animated.View entering={FadeIn.duration(250)}>
        <BrandMark size={96} />
      </Animated.View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ ...theme.typography.display, color: theme.colors.text }}>MOSI</Text>
        <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
          Manitoba Outdoor Safety Index
        </Text>
      </View>
    </Animated.View>
  );
}
