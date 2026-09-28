import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme';
import { tapHaptic } from '../../utils/haptics';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'md' | 'lg' | 'sm';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  trailingIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

const SIZES: Record<Size, { depth: number; paddingV: number; paddingH: number; fontSize: number; icon: number }> = {
  sm: { depth: 3, paddingV: 9, paddingH: 14, fontSize: 14, icon: 16 },
  md: { depth: 4, paddingV: 13, paddingH: 18, fontSize: 16, icon: 18 },
  lg: { depth: 5, paddingV: 17, paddingH: 22, fontSize: 17, icon: 20 },
};

/**
 * The app's signature control: a chunky button sitting on a coloured ledge that
 * physically sinks into it when pressed.
 */
export function TactileButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: Props) {
  const { colors: c, radii } = useAppTheme();
  const metrics = SIZES[size];
  const press = useSharedValue(0);

  const palette = {
    primary: { face: c.primary, ledge: c.primaryLedge, text: c.textOnPrimary, border: 'transparent' },
    secondary: { face: c.card, ledge: c.ledge, text: c.text, border: c.border },
    danger: { face: c.riskHigh, ledge: '#8E2A1E', text: '#FFFFFF', border: 'transparent' },
  }[variant];

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: press.value * metrics.depth }],
  }));

  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 70 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120 });
      }}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      hitSlop={4}
      style={[
        { paddingBottom: metrics.depth, alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: metrics.depth,
          bottom: 0,
          borderRadius: radii.md,
          backgroundColor: palette.ledge,
        }}
      />
      <Animated.View
        style={[
          {
            borderRadius: radii.md,
            backgroundColor: palette.face,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: palette.border,
            paddingVertical: metrics.paddingV,
            paddingHorizontal: metrics.paddingH,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          },
          faceStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : icon ? (
          <MaterialCommunityIcons name={icon} size={metrics.icon} color={palette.text} />
        ) : null}
        <Text style={{ fontFamily: 'Body-700', fontSize: metrics.fontSize, lineHeight: metrics.fontSize + 4, color: palette.text }}>
          {label}
        </Text>
        {trailingIcon && !loading ? (
          <MaterialCommunityIcons name={trailingIcon} size={metrics.icon} color={palette.text} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
