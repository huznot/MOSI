import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../theme';
import { MANITOBA_SUB_REGIONS, SubRegion } from '../data/manitobaSubRegions';
import { RegionId } from '../types/alerts';
import { useAppStore } from '../state/useAppStore';
import { selectHaptic } from '../utils/haptics';
import { Text } from './ui/Text';

const GROUP_LABELS: Record<RegionId, string> = {
  winnipeg: 'Winnipeg',
  southern: 'Southern Manitoba',
  eastern: 'Eastern Manitoba',
  western: 'Western Manitoba',
  northern: 'Northern Manitoba',
};

const GROUP_ICONS: Record<RegionId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  winnipeg: 'city-variant-outline',
  southern: 'barley',
  eastern: 'pine-tree',
  western: 'weather-windy',
  northern: 'snowflake',
};

const GROUP_ORDER: RegionId[] = ['winnipeg', 'southern', 'eastern', 'western', 'northern'];

type ZoneListProps = {
  selectedZoneId?: string | null;
  onSelect: (zoneId: string) => void;
};

/** Accordion of the five health regions and their zones. */
export function ZoneList({ selectedZoneId, onSelect }: ZoneListProps) {
  const theme = useAppTheme();
  const { colors: c, radii, spacing: sp, typography: ty } = theme;
  const initialGroup =
    MANITOBA_SUB_REGIONS.find((zone) => zone.id === selectedZoneId)?.parentRegionId ?? 'winnipeg';
  const [expandedGroup, setExpandedGroup] = useState<RegionId | null>(initialGroup as RegionId);

  return (
    <View style={{ gap: sp.sm }}>
      {GROUP_ORDER.map((regionId) => {
        const zones = MANITOBA_SUB_REGIONS.filter((zone) => zone.parentRegionId === regionId);
        const isExpanded = expandedGroup === regionId;

        return (
          <View
            key={regionId}
            style={{
              backgroundColor: c.card,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: c.border,
              boxShadow: theme.shadows.card,
              overflow: 'hidden',
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => {
                selectHaptic();
                setExpandedGroup(isExpanded ? null : regionId);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm, padding: sp.md, minHeight: 56 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.primarySoft,
                }}
              >
                <MaterialCommunityIcons name={GROUP_ICONS[regionId]} size={19} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...ty.title, color: c.text }}>{GROUP_LABELS[regionId]}</Text>
                <Text style={{ ...ty.caption, color: c.textMuted }}>{zones.length} areas</Text>
              </View>
              <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={c.textMuted} />
            </Pressable>

            {isExpanded ? (
              <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
                {zones.map((zone: SubRegion) => {
                  const selected = zone.id === selectedZoneId;
                  return (
                    <Pressable
                      key={zone.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        selectHaptic();
                        onSelect(zone.id);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: sp.md,
                        paddingVertical: sp.sm,
                        minHeight: 52,
                        borderTopWidth: 1,
                        borderTopColor: c.divider,
                        backgroundColor: selected ? c.primarySoft : pressed ? c.cardSecondary : 'transparent',
                      })}
                    >
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={{ ...ty.bodyStrong, color: c.text }}>{zone.name}</Text>
                        <Text style={{ ...ty.caption, color: c.textMuted }} numberOfLines={1}>
                          {zone.populationNote}
                        </Text>
                      </View>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={c.primary} /> : null}
                    </Pressable>
                  );
                })}
              </Animated.View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type Props = {
  onSelect: (zoneId: string) => Promise<void>;
  onClose: () => void;
};

export function RegionPickerModal({ onSelect, onClose }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty } = theme;
  const insets = useSafeAreaInsets();
  const selectedZoneId = useAppStore((state) => state.selectedSubRegionId);
  const isOutsideManitoba = useAppStore((state) => state.isOutsideManitoba);
  const locationSource = useAppStore((state) => state.locationSource);

  const subtitle = isOutsideManitoba
    ? 'You appear to be outside Manitoba. Pick an area to see its conditions.'
    : locationSource === 'gps'
      ? 'Switch to a different area. You can go back to your location in Settings.'
      : 'Pick the area closest to you. You can change it any time.';

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: sp.sm,
            maxHeight: '90%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: sp.lg, paddingBottom: sp.md, gap: sp.sm }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ ...ty.heading, color: c.text }}>Choose your area</Text>
              <Text style={{ ...ty.body, color: c.textMuted }}>{subtitle}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.cardTertiary,
              }}
            >
              <MaterialCommunityIcons name="close" size={20} color={c.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: sp.lg, paddingBottom: insets.bottom + sp.xl }}>
            <ZoneList selectedZoneId={selectedZoneId} onSelect={(zoneId) => void onSelect(zoneId)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
