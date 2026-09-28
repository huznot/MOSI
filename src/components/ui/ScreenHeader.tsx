import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../../theme';
import { Text } from './Text';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function ScreenHeader({ eyebrow, title, subtitle, right }: Props) {
  const { colors: c, typography: ty } = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text style={{ ...ty.sectionLabel, color: c.textSoft }}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={{ ...ty.display, color: c.text }}>
          {title}
        </Text>
        {subtitle ? <Text style={{ ...ty.body, color: c.textMuted, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
