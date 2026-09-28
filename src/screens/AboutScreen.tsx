import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { BrandMark } from '../components/ui/BrandMark';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Surface } from '../components/ui/Surface';
import { TactileButton } from '../components/ui/TactileButton';
import { Text } from '../components/ui/Text';
import { DATA_SOURCE_META, SAFETY_INDEX_WEIGHTS } from '../constants/config';
import { INDEPENDENCE_NOTICE, SUPPORT_EMAIL } from '../constants/legal';
import { RootStackParamList } from '../navigation/AppNavigator';
import { disableRiskNotifications, enableRiskNotifications, notificationsSupported } from '../services/notificationService';
import { useAppStore } from '../state/useAppStore';
import { ThemePreference, usePreferencesStore } from '../state/usePreferencesStore';
import { useAppTheme } from '../theme';
import { CategoryId } from '../types/alerts';
import { formatCategory } from '../utils/format';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function AboutScreen() {
  const theme = useAppTheme();
  const { colors: c, spacing: sp, typography: ty, radii } = theme;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const locationSource = useAppStore((s) => s.locationSource);
  const activeSubRegionLabel = useAppStore((s) => s.activeSubRegionLabel);
  const regionId = useAppStore((s) => s.selectedRegionId);
  const snapshots = useAppStore((s) => s.snapshots);
  const openRegionPicker = useAppStore((s) => s.openRegionPicker);
  const locateUser = useAppStore((s) => s.locateUser);
  const replayOnboarding = useAppStore((s) => s.replayOnboarding);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const setThemePreference = usePreferencesStore((s) => s.setThemePreference);
  const notificationsEnabled = usePreferencesStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = usePreferencesStore((s) => s.setNotificationsEnabled);
  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = usePreferencesStore((s) => s.setHapticsEnabled);

  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const areaLabel = activeSubRegionLabel ?? snapshots[regionId]?.region.label ?? 'Winnipeg';

  const handleLocate = async () => {
    setLocating(true);
    setLocationMessage(null);
    const result = await locateUser();
    setLocating(false);
    if (result === 'denied') {
      setLocationMessage('Location is off for MOSI. You can turn it on in your phone settings.');
    } else if (result === 'outside') {
      setLocationMessage('You appear to be outside Manitoba, so MOSI kept your chosen area.');
    }
  };

  const handleNotifications = async (value: boolean) => {
    setNotificationMessage(null);
    if (!value) {
      setNotificationsEnabled(false);
      await disableRiskNotifications();
      return;
    }
    if (!notificationsSupported) {
      setNotificationMessage("Alerts only work in the installed app, not in Expo Go.");
      return;
    }
    const active = await enableRiskNotifications().catch(() => false);
    setNotificationsEnabled(active);
    if (!active) {
      setNotificationMessage('Notifications are blocked for MOSI. Allow them in your phone settings first.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + sp.md,
        paddingHorizontal: sp.md,
        paddingBottom: sp.xxl,
        gap: sp.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader title="Settings" />

      <Section title="Your area">
        <Surface style={{ gap: sp.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm }}>
            <IconTile icon={locationSource === 'gps' ? 'navigation-variant' : 'map-marker'} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...ty.title, color: c.text }}>{areaLabel}</Text>
              <Text style={{ ...ty.caption, color: c.textMuted }}>
                {locationSource === 'gps' ? 'Using your location while the app is open' : 'Chosen manually'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: sp.sm }}>
            <TactileButton label="Change area" icon="map-search-outline" variant="secondary" size="sm" onPress={openRegionPicker} />
            <TactileButton
              label={locationSource === 'gps' ? 'Update location' : 'Use my location'}
              icon="crosshairs-gps"
              size="sm"
              loading={locating}
              onPress={() => void handleLocate()}
            />
          </View>
          {locationMessage ? (
            <Animated.View entering={FadeIn} style={{ gap: sp.xs }}>
              <Text style={{ ...ty.caption, color: c.textMuted }}>{locationMessage}</Text>
              <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
                <Text style={{ ...ty.caption, color: c.primary, fontWeight: '700' }}>Open phone settings</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </Surface>
      </Section>

      <Section title="Appearance">
        <SegmentedControl<ThemePreference>
          accessibilityLabel="Theme"
          options={[
            { label: 'System', value: 'system', icon: 'cellphone' },
            { label: 'Light', value: 'light', icon: 'white-balance-sunny' },
            { label: 'Dark', value: 'dark', icon: 'weather-night' },
          ]}
          value={themePreference}
          onChange={setThemePreference}
        />
      </Section>

      <Section title="Notifications & feel">
        <Surface padded={false}>
          <ToggleRow
            icon="bell-ring-outline"
            title="High-risk alerts"
            subtitle="A notification when a category in your area turns high."
            value={notificationsEnabled}
            onChange={(value) => void handleNotifications(value)}
          />
          {notificationMessage ? (
            <View style={{ paddingHorizontal: sp.md, paddingBottom: sp.md, gap: sp.xs }}>
              <Text style={{ ...ty.caption, color: c.textMuted }}>{notificationMessage}</Text>
              <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
                <Text style={{ ...ty.caption, color: c.primary, fontWeight: '700' }}>Open phone settings</Text>
              </Pressable>
            </View>
          ) : null}
          <Divider />
          <ToggleRow
            icon="vibrate"
            title="Haptic feedback"
            subtitle="Subtle vibration when you tap controls."
            value={hapticsEnabled}
            onChange={setHapticsEnabled}
          />
        </Surface>
      </Section>

      <Section title="About MOSI">
        <Surface padded={false}>
          <LinkRow
            icon="scale-balance"
            title="How the score works"
            trailing={showWeights ? 'chevron-up' : 'chevron-down'}
            onPress={() => setShowWeights((open) => !open)}
          />
          {showWeights ? (
            <Animated.View entering={FadeIn} style={{ paddingHorizontal: sp.md, paddingBottom: sp.md, gap: sp.sm }}>
              <Text style={{ ...ty.body, color: c.textMuted }}>
                Each category is rated low, moderate, or high. MOSI weights them, adds them up, and shows the result from
                0.0 (safest) to 3.0. The tick and mosquito weight rises in summer and falls in winter.
              </Text>
              {(Object.keys(SAFETY_INDEX_WEIGHTS) as CategoryId[]).map((category) => {
                const pct = Math.round(SAFETY_INDEX_WEIGHTS[category] * 100);
                return (
                  <View key={category} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ ...ty.bodyStrong, color: c.text }}>{formatCategory(category)}</Text>
                      <Text style={{ ...ty.tabular, color: c.textMuted }}>{pct}%</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cardTertiary, overflow: 'hidden' }}>
                      <View style={{ width: `${pct * 4}%`, height: '100%', borderRadius: 4, backgroundColor: c.primary }} />
                    </View>
                  </View>
                );
              })}
              <Text style={{ ...ty.caption, color: c.textSoft }}>
                Some categories, such as ticks and mosquitoes, are modelled from season, weather, and region rather than
                measured directly.
              </Text>
            </Animated.View>
          ) : null}
          <Divider />
          <LinkRow
            icon="database-outline"
            title="Data sources & licences"
            trailing={showSources ? 'chevron-up' : 'chevron-down'}
            onPress={() => setShowSources((open) => !open)}
          />
          {showSources ? (
            <Animated.View entering={FadeIn} style={{ paddingHorizontal: sp.md, paddingBottom: sp.md, gap: sp.xs }}>
              {DATA_SOURCE_META.map((source) => (
                <Pressable
                  key={source.name}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
                  style={({ pressed }) => ({
                    padding: sp.sm,
                    borderRadius: radii.md,
                    backgroundColor: pressed ? c.cardTertiary : c.cardSecondary,
                    gap: 2,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.xs }}>
                    <Text style={{ ...ty.bodyStrong, color: c.text, flex: 1 }}>{source.name}</Text>
                    <MaterialCommunityIcons name="open-in-new" size={14} color={c.textSoft} />
                  </View>
                  <Text style={{ ...ty.caption, color: c.textMuted }}>{source.provides}</Text>
                  <Text style={{ ...ty.caption, fontSize: 12, color: c.textSoft }}>
                    {source.frequency} · {source.licence}
                  </Text>
                </Pressable>
              ))}
              <Text style={{ ...ty.caption, color: c.textSoft, marginTop: sp.xs }}>
                Contains information licensed under the Open Government Licence – Canada and the Open Government Licence –
                Manitoba. Weather data by Open-Meteo.com (CC BY 4.0). Map data © OpenStreetMap contributors.
              </Text>
            </Animated.View>
          ) : null}
          <Divider />
          <LinkRow icon="replay" title="Replay the welcome tour" onPress={replayOnboarding} />
        </Surface>
      </Section>

      <Section title="Legal & safety">
        <Surface padded={false}>
          <LinkRow icon="shield-lock-outline" title="Privacy Policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} />
          <Divider />
          <LinkRow icon="file-document-outline" title="Terms of Use" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />
          <Divider />
          <LinkRow
            icon="email-outline"
            title="Contact & feedback"
            subtitle={SUPPORT_EMAIL}
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=MOSI%20feedback`).catch(() => undefined)}
          />
        </Surface>
        <View
          style={{
            flexDirection: 'row',
            gap: sp.sm,
            padding: sp.md,
            borderRadius: radii.lg,
            backgroundColor: c.highSoft,
          }}
        >
          <MaterialCommunityIcons name="phone-alert" size={20} color={c.riskHigh} />
          <Text style={{ ...ty.body, color: c.text, flex: 1 }}>
            MOSI is not an emergency service. In an emergency, call 911 and follow official instructions.
          </Text>
        </View>
        <Text style={{ ...ty.caption, color: c.textSoft }}>{INDEPENDENCE_NOTICE}</Text>
      </Section>

      <View style={{ alignItems: 'center', gap: sp.xs, paddingTop: sp.sm }}>
        <BrandMark size={40} />
        <Text style={{ ...ty.caption, color: c.textSoft }}>MOSI · Manitoba Outdoor Safety Index · v{version}</Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors: c, spacing: sp, typography: ty } = useAppTheme();
  return (
    <View style={{ gap: sp.sm }}>
      <Text accessibilityRole="header" style={{ ...ty.sectionLabel, color: c.textSoft, paddingHorizontal: 4 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function IconTile({ icon }: { icon: IconName }) {
  const { colors: c } = useAppTheme();
  return (
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
      <MaterialCommunityIcons name={icon} size={19} color={c.primary} />
    </View>
  );
}

function Divider() {
  const { colors: c, spacing: sp } = useAppTheme();
  return <View style={{ height: 1, backgroundColor: c.divider, marginLeft: sp.md + 36 + sp.sm }} />;
}

function LinkRow({
  icon,
  title,
  subtitle,
  trailing = 'chevron-right',
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  trailing?: IconName;
  onPress: () => void;
}) {
  const { colors: c, spacing: sp, typography: ty } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp.sm,
        padding: sp.md,
        minHeight: 60,
        backgroundColor: pressed ? c.cardSecondary : 'transparent',
      })}
    >
      <IconTile icon={icon} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...ty.bodyStrong, color: c.text }}>{title}</Text>
        {subtitle ? <Text style={{ ...ty.caption, color: c.textMuted }}>{subtitle}</Text> : null}
      </View>
      <MaterialCommunityIcons name={trailing} size={22} color={c.textSoft} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors: c, spacing: sp, typography: ty } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp.sm, padding: sp.md, minHeight: 64 }}>
      <IconTile icon={icon} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...ty.bodyStrong, color: c.text }}>{title}</Text>
        <Text style={{ ...ty.caption, color: c.textMuted }}>{subtitle}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.cardTertiary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
