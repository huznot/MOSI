import React from 'react';
import { View } from 'react-native';
import { Text } from './ui/Text';

import { RiskLevel } from '../types/alerts';
import { useAppTheme } from '../theme';
import { getRiskColor } from '../utils/risk';

type Props = {
  label: string;
  riskLevel: RiskLevel;
  selected?: boolean;
};

export function MapMarker({ label, riskLevel, selected = false }: Props) {
  const theme = useAppTheme();
  const accent = getRiskColor(riskLevel, theme.colors);

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? accent : theme.colors.divider,
        boxShadow: theme.shadows.card,
      }}
    >
      <Text selectable style={{ ...theme.typography.caption, color: theme.colors.text }}>
        {label}
      </Text>
    </View>
  );
}
