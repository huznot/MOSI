import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../theme';

type Props = {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LoadingSkeleton({ height, width = '100%', radius, circle = false, style }: Props) {
  const theme = useAppTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.42, 0.9]),
  }));

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: circle ? height / 2 : radius ?? theme.radii.lg,
          backgroundColor: theme.colors.skeleton,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
