import React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { useAppTheme } from '../theme';
import { selectHaptic } from '../utils/haptics';
import { Text } from './ui/Text';

type ChipOption<T extends string | number> = {
  label: string;
  value: T;
};

type Props<T extends string | number> = {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
};

/** Single-line, horizontally scrolling filter chips. The active chip sits raised on a ledge. */
export function FilterChips<T extends string | number>({ options, selected, onSelect }: Props<T>) {
  const { colors: c, radii, spacing: sp } = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: sp.xs, paddingBottom: 4, paddingHorizontal: sp.md }}
      style={{ marginHorizontal: -sp.md }}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={`${option.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) {
                selectHaptic();
                onSelect(option.value);
              }
            }}
            style={{
              paddingHorizontal: 16,
              minHeight: 38,
              justifyContent: 'center',
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: active ? c.primary : c.border,
              backgroundColor: active ? c.primary : c.card,
              boxShadow: active ? `0 3px 0 ${c.primaryLedge}` : `0 2px 0 ${c.ledge}`,
            }}
          >
            <Text
              style={{
                fontFamily: 'Body-700',
                fontSize: 14,
                color: active ? c.textOnPrimary : c.textMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
