import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../theme';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  light?: boolean;
  rightSlot?: React.ReactNode;
};

export function SectionTitle({ eyebrow, title, subtitle, light = false, rightSlot }: Props) {
  const theme = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? (
          <Text
            selectable
            style={{
              ...theme.typography.sectionLabel,
              color: light ? 'rgba(255,255,255,0.74)' : theme.colors.textSoft,
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text selectable style={{ ...theme.typography.heading, color: light ? theme.colors.textOnPrimary : theme.colors.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text selectable style={{ ...theme.typography.body, color: light ? 'rgba(255,255,255,0.8)' : theme.colors.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot}
    </View>
  );
}
