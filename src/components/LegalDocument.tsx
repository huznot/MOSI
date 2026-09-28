import React from 'react';
import { View } from 'react-native';

import { LEGAL_LAST_UPDATED, LegalSection } from '../constants/legal';
import { useAppTheme } from '../theme';
import { Text } from './ui/Text';

type Props = {
  sections: LegalSection[];
};

export function LegalDocument({ sections }: Props) {
  const { colors: c, spacing: sp, typography: ty } = useAppTheme();

  return (
    <View style={{ gap: sp.lg }}>
      <Text style={{ ...ty.caption, color: c.textSoft }}>Last updated {LEGAL_LAST_UPDATED}</Text>
      {sections.map((section) => (
        <View key={section.heading} style={{ gap: sp.xs }}>
          <Text accessibilityRole="header" style={{ ...ty.title, color: c.text }}>
            {section.heading}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} selectable style={{ ...ty.body, color: c.textMuted }}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
