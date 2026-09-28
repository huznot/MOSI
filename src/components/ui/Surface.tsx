import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useAppTheme } from '../../theme';
import { tapHaptic } from '../../utils/haptics';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
  tone?: 'card' | 'muted';
};

/** Standard card surface. When pressable it sinks slightly onto its ledge. */
export function Surface({ children, style, onPress, accessibilityLabel, accessibilityHint, padded = true, tone = 'card' }: Props) {
  const theme = useAppTheme();
  const press = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: press.value * 2 }],
  }));

  const baseStyle: ViewStyle = {
    backgroundColor: tone === 'card' ? theme.colors.card : theme.colors.cardSecondary,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: padded ? theme.spacing.md : 0,
    boxShadow: tone === 'card' ? theme.shadows.card : undefined,
  };

  if (!onPress) {
    return <View style={[baseStyle, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120 });
      }}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
    >
      <Animated.View style={[baseStyle, style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
