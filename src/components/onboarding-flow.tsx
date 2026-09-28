import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { CATEGORY_META } from '../constants/config';
import { INDEPENDENCE_NOTICE, PRIVACY_POLICY, SAFETY_NOTICE, TERMS_OF_USE } from '../constants/legal';
import { MANITOBA_SUB_REGIONS } from '../data/manitobaSubRegions';
import { enableRiskNotifications, notificationsSupported } from '../services/notificationService';
import { useAppStore } from '../state/useAppStore';
import { usePreferencesStore } from '../state/usePreferencesStore';
import { useAppTheme } from '../theme';
import { CategoryId } from '../types/alerts';
import { successHaptic } from '../utils/haptics';
import { LegalDocument } from './LegalDocument';
import { ZoneList } from './region-picker-modal';
import { BrandMark } from './ui/BrandMark';
import { TactileButton } from './ui/TactileButton';
import { Text } from './ui/Text';

type Props = {
  onDone: () => void;
};

const STEPS = ['welcome', 'score', 'location', 'ready'] as const;
const CATEGORY_ORDER: CategoryId[] = ['weather', 'airQuality', 'wildfire', 'water', 'vectorBorne', 'healthAdvisories'];
const CATEGORY_BLURB: Record<CategoryId, string> = {
  weather: 'Heat, cold & storms',
  airQuality: 'Smoke & AQHI',
  wildfire: 'Active fires',
  water: 'Boil-water & beaches',
  vectorBorne: 'Ticks & mosquitoes',
  healthAdvisories: 'Public health notices',
};

type LocationState = 'idle' | 'locating' | 'granted' | 'denied' | 'outside' | 'manual';

export function OnboardingFlow({ onDone }: Props) {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [showZoneList, setShowZoneList] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const locateUser = useAppStore((state) => state.locateUser);
  const setSelectedZone = useAppStore((state) => state.setSelectedZone);
  const selectedZoneId = useAppStore((state) => state.selectedSubRegionId);
  const activeSubRegionLabel = useAppStore((state) => state.activeSubRegionLabel);
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const selectedZoneName = MANITOBA_SUB_REGIONS.find((zone) => zone.id === selectedZoneId)?.name ?? null;
  const hasLocation = locationState === 'granted' || locationState === 'manual';

  const next = () => (isLast ? onDone() : setStepIndex((index) => index + 1));

  const handleLocate = async () => {
    setLocationState('locating');
    const result = await locateUser({ refresh: false });
    setLocationState(result);
    if (result === 'granted') {
      successHaptic();
      setShowZoneList(false);
    } else {
      setShowZoneList(true);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (!value) {
      setNotificationsEnabled(false);
      return;
    }
    setNotificationsBusy(true);
    const active = await enableRiskNotifications().catch(() => false);
    setNotificationsEnabled(active);
    setNotificationsBusy(false);
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <View style={{ gap: sp.xl }}>
            <Animated.View entering={FadeIn.duration(250)}>
              <BrandMark size={84} />
            </Animated.View>
            <View style={{ gap: sp.sm }}>
              <Text style={{ ...ty.sectionLabel, color: c.primary }}>Manitoba Outdoor Safety Index</Text>
              <Text accessibilityRole="header" style={{ ...ty.hero, fontSize: 46, lineHeight: 50, color: c.text }}>
                Know before you head out.
              </Text>
              <Text style={{ ...ty.body, fontSize: 17, lineHeight: 25, color: c.textMuted }}>
                One score for where you are in Manitoba, built from six kinds of public safety data.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp.xs }}>
              {CATEGORY_ORDER.map((category, index) => (
                <Animated.View
                  key={category}
                  entering={FadeIn.duration(250)}
                  style={{
                    width: '48.5%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: sp.xs,
                    padding: sp.sm,
                    borderRadius: radii.md,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.border,
                    boxShadow: theme.shadows.card,
                  }}
                >
                  <MaterialCommunityIcons name={CATEGORY_META[category].icon as never} size={20} color={c.primary} />
                  <Text style={{ ...ty.caption, color: c.text, flex: 1 }} numberOfLines={2}>
                    {CATEGORY_BLURB[category]}
                  </Text>
                </Animated.View>
              ))}
            </View>
          </View>
        );

      case 'score':
        return (
          <View style={{ gap: sp.xl }}>
            <View style={{ gap: sp.sm }}>
              <Text style={{ ...ty.sectionLabel, color: c.primary }}>Reading the score</Text>
              <Text accessibilityRole="header" style={{ ...ty.display, color: c.text }}>
                Lower is safer.
              </Text>
              <Text style={{ ...ty.body, fontSize: 17, lineHeight: 25, color: c.textMuted }}>
                Your score runs from 0.0 to 3.0. Tap any category on the dashboard to see what is driving it.
              </Text>
            </View>
            {(
              [
                { level: 'low', range: '0.0 – 0.9', title: 'Low', body: 'Normal outdoor precautions.' },
                { level: 'moderate', range: '0.9 – 2.0', title: 'Moderate', body: 'Take care. Sensitive groups should plan ahead.' },
                { level: 'high', range: '2.0 – 3.0', title: 'High', body: 'Real hazards present. Consider changing plans.' },
              ] as const
            ).map((row, index) => {
              const color = row.level === 'low' ? c.riskLow : row.level === 'moderate' ? c.riskModerate : c.riskHigh;
              const soft = row.level === 'low' ? c.lowSoft : row.level === 'moderate' ? c.mediumSoft : c.highSoft;
              return (
                <Animated.View
                  key={row.level}
                  entering={FadeIn.duration(250)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: sp.md,
                    padding: sp.md,
                    borderRadius: radii.lg,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.border,
                    boxShadow: theme.shadows.card,
                  }}
                >
                  <View
                    style={{
                      width: 64,
                      paddingVertical: 8,
                      borderRadius: radii.sm,
                      backgroundColor: soft,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ ...ty.tabular, fontSize: 13, color }}>{row.range}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ ...ty.title, color }}>{row.title}</Text>
                    <Text style={{ ...ty.caption, color: c.textMuted }}>{row.body}</Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        );

      case 'location':
        return (
          <View style={{ gap: sp.lg }}>
            <View style={{ gap: sp.sm }}>
              <Text style={{ ...ty.sectionLabel, color: c.primary }}>Your area</Text>
              <Text accessibilityRole="header" style={{ ...ty.display, color: c.text }}>
                Where are you?
              </Text>
            </View>

            {/* Prominent disclosure shown before the OS prompt, as Google Play requires. */}
            <View
              style={{
                gap: sp.sm,
                padding: sp.md,
                borderRadius: radii.lg,
                backgroundColor: c.cardSecondary,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              {[
                { icon: 'crosshairs-gps', text: 'MOSI uses your location only while the app is open, to find your Manitoba area and nearby advisories.' },
                { icon: 'cellphone-lock', text: 'It stays on your phone. MOSI has no accounts and no servers, and never tracks you in the background.' },
                { icon: 'weather-cloudy', text: 'A rounded position (about 1 km) is sent to weather services to get your forecast.' },
              ].map((row) => (
                <View key={row.icon} style={{ flexDirection: 'row', gap: sp.sm, alignItems: 'flex-start' }}>
                  <MaterialCommunityIcons name={row.icon as never} size={18} color={c.primary} style={{ marginTop: 2 }} />
                  <Text style={{ ...ty.body, color: c.textMuted, flex: 1 }}>{row.text}</Text>
                </View>
              ))}
            </View>

            {hasLocation ? (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: sp.sm,
                  padding: sp.md,
                  borderRadius: radii.lg,
                  backgroundColor: c.lowSoft,
                }}
              >
                <MaterialCommunityIcons name="check-circle" size={22} color={c.riskLow} />
                <Text style={{ ...ty.bodyStrong, color: c.text, flex: 1 }}>
                  {locationState === 'granted'
                    ? `Found you${activeSubRegionLabel ? ` in ${activeSubRegionLabel}` : ''}.`
                    : `Showing ${selectedZoneName ?? 'your area'}.`}
                </Text>
              </Animated.View>
            ) : null}

            {locationState === 'denied' || locationState === 'outside' ? (
              <Text style={{ ...ty.body, color: c.textMuted }}>
                {locationState === 'outside'
                  ? 'You seem to be outside Manitoba, so pick an area to preview.'
                  : 'No problem. Pick the area closest to you instead.'}
              </Text>
            ) : null}

            {!hasLocation ? (
              <View style={{ gap: sp.sm }}>
                <TactileButton
                  label="Use my location"
                  icon="crosshairs-gps"
                  size="lg"
                  fullWidth
                  loading={locationState === 'locating'}
                  onPress={() => void handleLocate()}
                />
                {!showZoneList ? (
                  <TactileButton
                    label="Choose my area instead"
                    icon="map-search-outline"
                    variant="secondary"
                    fullWidth
                    onPress={() => setShowZoneList(true)}
                  />
                ) : null}
              </View>
            ) : (
              <Pressable onPress={() => setShowZoneList((open) => !open)} hitSlop={8}>
                <Text style={{ ...ty.bodyStrong, color: c.primary }}>
                  {showZoneList ? 'Hide area list' : 'Pick a different area'}
                </Text>
              </Pressable>
            )}

            {showZoneList ? (
              <ZoneList
                selectedZoneId={locationState === 'manual' ? selectedZoneId : null}
                onSelect={(zoneId) => {
                  void setSelectedZone(zoneId, { refresh: false });
                  setLocationState('manual');
                  setShowZoneList(false);
                  successHaptic();
                }}
              />
            ) : null}
          </View>
        );

      case 'ready':
        return (
          <View style={{ gap: sp.lg }}>
            <View style={{ gap: sp.sm }}>
              <Text style={{ ...ty.sectionLabel, color: c.primary }}>Almost there</Text>
              <Text accessibilityRole="header" style={{ ...ty.display, color: c.text }}>
                A couple of things.
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: sp.md,
                padding: sp.md,
                borderRadius: radii.lg,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                boxShadow: theme.shadows.card,
              }}
            >
              <MaterialCommunityIcons name="bell-ring-outline" size={24} color={c.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ ...ty.title, color: c.text }}>High-risk alerts</Text>
                <Text style={{ ...ty.caption, color: c.textMuted }}>
                  {notificationsSupported
                    ? 'Optional. Get a notification when something in your area turns high.'
                    : 'Available in the installed app (not in Expo Go).'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="High-risk alerts"
                value={notificationsEnabled}
                disabled={notificationsBusy || !notificationsSupported}
                onValueChange={(value) => void handleToggleNotifications(value)}
                trackColor={{ true: c.primary, false: c.cardTertiary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View
              style={{
                gap: sp.sm,
                padding: sp.md,
                borderRadius: radii.lg,
                backgroundColor: c.mediumSoft,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.xs }}>
                <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={c.riskModerate} />
                <Text style={{ ...ty.title, color: c.text }}>Please read</Text>
              </View>
              <Text style={{ ...ty.body, color: c.text }}>{SAFETY_NOTICE}</Text>
              <Text style={{ ...ty.caption, color: c.textMuted }}>{INDEPENDENCE_NOTICE}</Text>
            </View>

            <Text style={{ ...ty.caption, color: c.textMuted }}>
              By continuing you agree to the{' '}
              <Text style={{ ...ty.caption, color: c.primary, fontWeight: '700' }} onPress={() => setLegalDoc('terms')}>
                Terms of Use
              </Text>{' '}
              and{' '}
              <Text style={{ ...ty.caption, color: c.primary, fontWeight: '700' }} onPress={() => setLegalDoc('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        );
    }
  };

  const primaryLabel =
    step === 'welcome' ? 'Get started' : step === 'location' && !hasLocation ? 'Skip for now' : isLast ? 'I understand, open MOSI' : 'Continue';

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: insets.top + sp.sm,
          paddingHorizontal: sp.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp.md,
          minHeight: 48,
        }}
      >
        {stepIndex > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => setStepIndex((index) => Math.max(0, index - 1))}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={c.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <View
              key={item}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: index <= stepIndex ? c.primary : c.cardTertiary,
              }}
            />
          ))}
        </View>
      </View>

      <ScrollView
        key={step}
        contentContainerStyle={{ padding: sp.lg, paddingTop: sp.xl, paddingBottom: sp.xl, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
          {renderStep()}
        </Animated.View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: sp.lg,
          paddingTop: sp.sm,
          paddingBottom: insets.bottom + sp.md,
          borderTopWidth: 1,
          borderTopColor: c.divider,
          backgroundColor: c.background,
        }}
      >
        <TactileButton
          label={primaryLabel}
          variant={step === 'location' && !hasLocation ? 'secondary' : 'primary'}
          trailingIcon={isLast ? undefined : 'arrow-right'}
          size="lg"
          fullWidth
          onPress={next}
        />
      </View>

      <Modal
        visible={legalDoc !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalDoc(null)}
      >
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: sp.lg, paddingTop: insets.top + sp.md }}>
            <Text style={{ ...ty.heading, color: c.text, flex: 1 }}>
              {legalDoc === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setLegalDoc(null)}>
              <MaterialCommunityIcons name="close" size={24} color={c.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: sp.lg, paddingTop: 0, paddingBottom: insets.bottom + sp.xl }}>
            <LegalDocument sections={legalDoc === 'privacy' ? PRIVACY_POLICY : TERMS_OF_USE} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
