import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../theme';

export function DomainDetailScreen() {
  const theme = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background,
      }}
    >
      <Text selectable style={{ ...theme.typography.body, color: theme.colors.textMuted, textAlign: 'center' }}>
        This legacy screen is no longer used.
      </Text>
    </View>
  );
}
