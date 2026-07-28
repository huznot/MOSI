import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../theme';
import { MANITOBA_SUB_REGIONS, SubRegion } from '../data/manitobaSubRegions';
import { RegionId } from '../types/alerts';

type Props = {
  onSelect: (zoneId: string) => Promise<void>;
};

const GROUP_LABELS: Record<RegionId, string> = {
  winnipeg: 'Winnipeg',
  southern: 'Southern Manitoba',
  eastern:  'Eastern Manitoba',
  western:  'Western Manitoba',
  northern: 'Northern Manitoba',
};

const GROUP_ORDER: RegionId[] = ['winnipeg', 'southern', 'eastern', 'western', 'northern'];

export function RegionPickerModal({ onSelect }: Props) {
  const theme = useAppTheme();
  const [expandedGroup, setExpandedGroup] = useState<RegionId | null>('winnipeg');

  const groups = GROUP_ORDER.map((regionId) => ({
    regionId,
    label: GROUP_LABELS[regionId],
    zones: MANITOBA_SUB_REGIONS.filter((z) => z.parentRegionId === regionId),
  }));

  return (
    <Modal animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: theme.spacing.lg,
            maxHeight: '88%',
            gap: theme.spacing.md,
          }}
        >
          <Text style={{ ...theme.typography.sectionLabel, color: theme.colors.textSoft }}>Choose Location</Text>
          <Text style={{ ...theme.typography.heading, color: theme.colors.text }}>
            Where are you in Manitoba?
          </Text>
          <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
            Select your nearest zone. GPS was unavailable so MOSI needs your location to show accurate alerts.
          </Text>

          <ScrollView contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xl }}>
            {groups.map(({ regionId, label, zones }) => {
              const isExpanded = expandedGroup === regionId;
              return (
                <View
                  key={regionId}
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: theme.radii.lg,
                    overflow: 'hidden',
                    boxShadow: theme.shadows.card,
                  }}
                >
                  {}
                  <Pressable
                    onPress={() => setExpandedGroup(isExpanded ? null : regionId)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: theme.spacing.md,
                    }}
                  >
                    <Text style={{ ...theme.typography.title, color: theme.colors.text }}>{label}</Text>
                    <MaterialCommunityIcons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={theme.colors.textMuted}
                    />
                  </Pressable>

                  {}
                  {isExpanded
                    ? zones.map((zone: SubRegion) => (
                        <Pressable
                          key={zone.id}
                          onPress={() => void onSelect(zone.id)}
                          style={{
                            paddingHorizontal: theme.spacing.md,
                            paddingVertical: theme.spacing.sm,
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.divider,
                            gap: 2,
                          }}
                        >
                          <Text style={{ ...theme.typography.body, color: theme.colors.text }}>{zone.name}</Text>
                          <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                            {zone.populationNote}
                          </Text>
                        </Pressable>
                      ))
                    : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
