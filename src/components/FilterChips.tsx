import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../theme';

type ChipOption<T extends string | number> = {
  label: string;
  value: T;
};

type Props<T extends string | number> = {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  dark?: boolean;
};

export function FilterChips<T extends string | number>({ options, selected, onSelect, dark = false }: Props<T>) {
  const theme = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={`${option.value}`}
            onPress={() => onSelect(option.value)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: theme.radii.pill,
              backgroundColor: active
                ? dark
                  ? theme.colors.textOnPrimary
                  : theme.colors.primary
                : dark
                  ? 'rgba(255,255,255,0.08)'
                  : theme.colors.cardSecondary,
            }}
          >
            <Text
              selectable
              style={{
                ...theme.typography.caption,
                color: active
                  ? dark
                    ? theme.colors.primary
                    : theme.colors.textOnPrimary
                  : dark
                    ? 'rgba(255,255,255,0.72)'
                    : theme.colors.textMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
