import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme';
import { selectHaptic } from '../../utils/haptics';
import { Text } from './Text';

type Option<T extends string> = {
  label: string;
  value: T;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** A recessed track with a raised, ledged thumb on the active option. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors: c, radii } = useAppTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        backgroundColor: c.cardTertiary,
        borderRadius: radii.md,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!active) {
                selectHaptic();
                onChange(option.value);
              }
            }}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: radii.sm,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: active ? c.card : 'transparent',
              boxShadow: active ? `0 2px 0 ${c.ledge}` : undefined,
            }}
          >
            {option.icon ? (
              <MaterialCommunityIcons name={option.icon} size={16} color={active ? c.text : c.textMuted} />
            ) : null}
            <Text style={{ fontFamily: 'Body-700', fontSize: 14, color: active ? c.text : c.textMuted }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
