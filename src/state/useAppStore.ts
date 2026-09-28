import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '../constants/config';
import {
  AlertDetail,
  BeachMonitoringPoint,
  CategoryId,
  HydroOutage,
  LocalAreaProfile,
  LocationPermissionState,
  LocationSource,
  MbReadyAlert,
  PredictionBundle,
  RegionCoordinate,
  RegionId,
  RegionSnapshot,
  UserCoordinates,
} from '../types/alerts';
import { refreshAllRegionData } from '../services/alertAggregator';
import { fetchBeachMonitoringData } from '../services/beachMonitoringService';
import { fetchHydroOutages } from '../services/hydroOutageService';
import { fetchPredictionBundleForTarget } from '../services/predictionService';
import {
  buildLocalAreaProfile,
  buildSubRegionLabel,
  buildZoneAreaProfile,
  detectUserRegion,
  findSubRegionByCoordinates,
  getAllRegions,
  getRegionById,
} from '../services/locationService';
import { MANITOBA_SUB_REGIONS, SubRegion } from '../data/manitobaSubRegions';
import { enableRiskNotifications, setNotificationRegion } from '../services/notificationService';
import { usePreferencesStore } from './usePreferencesStore';
import {
  buildLocalAreaSnapshotPreview,
  buildZoneSnapshotPreview,
  fetchLocalAreaSnapshot,
  fetchZoneSnapshot,
} from '../services/zoneSnapshotService';
import { enrichWaterAdvisoryShapes, getWaterSiteIdentity } from '../services/waterAdvisoryService';

type FilterValue = CategoryId | 'all';

export type LocateResult = 'granted' | 'denied' | 'outside';

type AppState = {
  isHydrated: boolean;
  isInitialized: boolean;
  isRefreshing: boolean;
  isPredictionRefreshing: boolean;
  isRegionSwitching: boolean;
  isOffline: boolean;
  permissionStatus: LocationPermissionState;
  locationSource: LocationSource;
  userCoordinates: UserCoordinates | null;
  hasCompletedOnboarding: boolean;
  showRegionPicker: boolean;
  isOutsideManitoba: boolean;
  selectedRegionId: RegionId;
  selectedMapRegionId: RegionId;
  selectedSubRegionId: string | null;
  activeArea: LocalAreaProfile | null;
  activeSubRegionLabel: string | null;
  selectedAlertFilter: FilterValue;
  selectedAreaSnapshot: RegionSnapshot | null;
  selectedAreaAlertDetails: AlertDetail[];
  snapshots: Record<string, RegionSnapshot>;
  predictionByRegion: Partial<Record<string, PredictionBundle>>;
  rawAlertDetails: AlertDetail[];
  mapLocationAlerts: AlertDetail[];
  beachMonitoringPoints: BeachMonitoringPoint[];
  mbReadyAlerts: MbReadyAlert[];
  hydroOutages: HydroOutage[];
  initialize: () => Promise<void>;
  refreshAll: () => Promise<void>;
  ensurePredictionForRegion: (regionId?: RegionId) => Promise<void>;
  setSelectedRegion: (regionId: RegionId, source?: LocationSource) => Promise<void>;
  chooseManualRegion: (regionId: RegionId) => Promise<void>;
  setSelectedZone: (zoneId: string, options?: { refresh?: boolean }) => Promise<void>;
  locateUser: (options?: { refresh?: boolean }) => Promise<LocateResult>;
  openRegionPicker: () => void;
  replayOnboarding: () => void;
  setSelectedMapRegion: (regionId: RegionId) => void;
  setSelectedAlertFilter: (filter: FilterValue) => void;
  completeOnboarding: () => void;
  dismissRegionPicker: () => void;
};

function createInitialSnapshots() {
  return getAllRegions().reduce<Record<string, RegionSnapshot>>((accumulator, region) => {
    const fallbackTimestamp = new Date().toISOString();
    accumulator[region.id] = {
      region,
      fetchedAt: fallbackTimestamp,
      alerts: {
        weather: {
          category: 'weather',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
        airQuality: {
          category: 'airQuality',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
        wildfire: {
          category: 'wildfire',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
        water: {
          category: 'water',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
        vectorBorne: {
          category: 'vectorBorne',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
        healthAdvisories: {
          category: 'healthAdvisories',
          value: 'n/a',
          riskLevel: 'low',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          dataStatus: 'unavailable',
          lastUpdated: fallbackTimestamp,
        },
      },
      safetyIndex: {
        overallScore: 1,
        overallRisk: 'low',
        breakdown: [],
      },
    };
    return accumulator;
  }, {});
}

const INITIAL_SNAPSHOTS = createInitialSnapshots();
let latestWaterShapeEnrichmentRun = 0;

function areImpactPolygonsEqual(
  left: readonly RegionCoordinate[] | null | undefined,
  right: readonly RegionCoordinate[] | null | undefined,
) {
  const normalizedLeft = left ?? null;
  const normalizedRight = right ?? null;

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every(
    (point, index) =>
      point.latitude === normalizedRight[index].latitude &&
      point.longitude === normalizedRight[index].longitude,
  );
}

function patchWaterAlertShapes(
  alerts: AlertDetail[],
  patches: ReadonlyMap<string, RegionCoordinate[] | null>,
) {
  let didChange = false;

  const nextAlerts = alerts.map((alert) => {
    if (alert.category !== 'water' || !alert.coordinates) {
      return alert;
    }

    const siteKey = getWaterSiteIdentity({
      coordinates: alert.coordinates,
      systemName: alert.title,
    });

    if (!patches.has(siteKey)) {
      return alert;
    }

    const nextPolygon = patches.get(siteKey) ?? null;
    if (areImpactPolygonsEqual(alert.impactPolygon, nextPolygon)) {
      return alert;
    }

    didChange = true;
    return {
      ...alert,
      impactPolygon: nextPolygon,
    };
  });

  return didChange ? nextAlerts : alerts;
}

function buildSelectedAreaPresentation(
  state: Pick<
    AppState,
    'selectedSubRegionId' | 'activeArea' | 'locationSource' | 'selectedRegionId' | 'selectedAreaSnapshot'
  >,
  snapshots: Record<string, RegionSnapshot>,
  rawAlertDetails: AlertDetail[],
  mapLocationAlerts: AlertDetail[],
) {
  const selectedZone = state.selectedSubRegionId
    ? MANITOBA_SUB_REGIONS.find((zone) => zone.id === state.selectedSubRegionId) ?? null
    : null;
  const shouldLocalizeActiveArea = state.locationSource === 'gps' && Boolean(state.activeArea);
  const parentSnapshot =
    selectedZone
      ? snapshots[selectedZone.parentRegionId] ?? null
      : shouldLocalizeActiveArea && state.activeArea
        ? snapshots[state.activeArea.parentRegionId] ?? null
        : snapshots[state.selectedRegionId] ?? null;
  const localizedBaseSnapshot = state.selectedAreaSnapshot ?? parentSnapshot;
  const localizedResult =
    selectedZone && localizedBaseSnapshot
      ? buildZoneSnapshotPreview(selectedZone, localizedBaseSnapshot, rawAlertDetails, mapLocationAlerts)
      : shouldLocalizeActiveArea && state.activeArea && localizedBaseSnapshot
        ? buildLocalAreaSnapshotPreview(state.activeArea, localizedBaseSnapshot, rawAlertDetails, mapLocationAlerts)
        : null;

  return {
    selectedAreaSnapshot: localizedResult?.snapshot ?? parentSnapshot,
    selectedAreaAlertDetails: localizedResult
      ? [...localizedResult.exactAlerts, ...localizedResult.broaderAlerts]
      : rawAlertDetails,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      isHydrated: false,
      isInitialized: false,
      isRefreshing: false,
      isPredictionRefreshing: false,
      isRegionSwitching: false,
      isOffline: false,
      permissionStatus: 'undetermined',
      locationSource: 'unknown',
      userCoordinates: null,
      hasCompletedOnboarding: false,
      showRegionPicker: false,
      isOutsideManitoba: false,
      selectedRegionId: 'winnipeg',
      selectedMapRegionId: 'winnipeg',
      selectedSubRegionId: null,
      activeArea: buildLocalAreaProfile(getRegionById('winnipeg')),
      activeSubRegionLabel: null,
      selectedAlertFilter: 'all',
      selectedAreaSnapshot: INITIAL_SNAPSHOTS.winnipeg,
      selectedAreaAlertDetails: [],
      snapshots: INITIAL_SNAPSHOTS,
      predictionByRegion: {},
      rawAlertDetails: [],
      mapLocationAlerts: [],
      beachMonitoringPoints: [],
      mbReadyAlerts: [],
      hydroOutages: [],
      initialize: async () => {
        if (get().isInitialized) {
          return;
        }

        let initialRegionId = get().selectedRegionId;
        // Never prompts here: permission is only requested from the onboarding disclosure or Settings.
        const locationResult = await detectUserRegion();
        const hasManualChoice = get().locationSource === 'manual';

        if (locationResult.permissionStatus === 'granted' && locationResult.coordinates && !hasManualChoice) {
          initialRegionId = locationResult.region.id;
          const subRegion = findSubRegionByCoordinates(
            locationResult.coordinates.latitude,
            locationResult.coordinates.longitude,
          );
          set({
            permissionStatus: 'granted',
            locationSource: 'gps',
            userCoordinates: locationResult.coordinates,
            selectedRegionId: locationResult.region.id,
            selectedMapRegionId: locationResult.region.id,
            selectedSubRegionId: subRegion?.id ?? null,
            activeArea: buildLocalAreaProfile(locationResult.region, locationResult.coordinates),
            activeSubRegionLabel: subRegion ? buildSubRegionLabel(subRegion) : null,
            showRegionPicker: false,
            isOutsideManitoba: false,
          });
        } else if (hasManualChoice) {
          // Keep the area the user picked (including a specific zone).
          initialRegionId = get().selectedRegionId;
          set({
            permissionStatus: locationResult.permissionStatus,
            isOutsideManitoba: locationResult.outsideManitoba,
            showRegionPicker: false,
          });
        } else {
          const defaultRegion = getRegionById(get().selectedRegionId ?? 'winnipeg');
          initialRegionId = defaultRegion.id;
          set({
            permissionStatus: locationResult.permissionStatus,
            locationSource: 'manual',
            selectedRegionId: defaultRegion.id,
            selectedMapRegionId: defaultRegion.id,
            selectedSubRegionId: null,
            activeArea: buildLocalAreaProfile(defaultRegion),
            activeSubRegionLabel: null,
            isOutsideManitoba: locationResult.outsideManitoba,
            showRegionPicker: true,
          });
        }

        if (usePreferencesStore.getState().notificationsEnabled) {
          // Re-arms the background check; if the OS permission was revoked, reflect that in Settings.
          void enableRiskNotifications()
            .then((active) => {
              if (!active) usePreferencesStore.getState().setNotificationsEnabled(false);
            })
            .catch(() => undefined);
        }

        await get().refreshAll();
        // The outlook tab loads its own data; the dashboard should not wait for it.
        void get().ensurePredictionForRegion(initialRegionId);
        set({ isInitialized: true });
      },
      refreshAll: async () => {
        set({ isRefreshing: true });
        const waterShapeEnrichmentRun = ++latestWaterShapeEnrichmentRun;
        try {
          const selectedZone = get().selectedSubRegionId
            ? MANITOBA_SUB_REGIONS.find((sr) => sr.id === get().selectedSubRegionId) ?? null
            : null;
          const activeArea = get().activeArea;
          const shouldLocalizeActiveArea = get().locationSource === 'gps' && Boolean(activeArea);
          const [
            { snapshots, alertDetails, mapLocationAlerts, waterEnrichmentCandidates, mbReadyAlerts },
            beachPoints,
            hydroOutages,
          ] = await Promise.all([
            refreshAllRegionData(get().userCoordinates, selectedZone, get().selectedRegionId),
            fetchBeachMonitoringData().catch(() => get().beachMonitoringPoints),
            fetchHydroOutages().catch(() => get().hydroOutages),
          ]);
          if (Object.keys(snapshots).length) {
            const parentSnapshot =
              selectedZone
                ? snapshots[selectedZone.parentRegionId] ?? null
                : shouldLocalizeActiveArea && activeArea
                  ? snapshots[activeArea.parentRegionId] ?? null
                  : snapshots[get().selectedRegionId] ?? null;
            // Show the area immediately from regional data; local weather refines it below.
            const localizedResult =
              selectedZone && parentSnapshot
                ? buildZoneSnapshotPreview(selectedZone, parentSnapshot, alertDetails, mapLocationAlerts)
                : shouldLocalizeActiveArea && activeArea && parentSnapshot
                  ? buildLocalAreaSnapshotPreview(activeArea, parentSnapshot, alertDetails, mapLocationAlerts)
                  : null;

            const localRefinement =
              selectedZone && parentSnapshot
                ? fetchZoneSnapshot(selectedZone, parentSnapshot, alertDetails, mapLocationAlerts)
                : shouldLocalizeActiveArea && activeArea && parentSnapshot
                  ? fetchLocalAreaSnapshot(activeArea, parentSnapshot, alertDetails, mapLocationAlerts)
                  : null;
            const selectionKey = `${get().selectedSubRegionId}|${get().activeArea?.id}|${get().locationSource}`;
            void localRefinement
              ?.then((refined) => {
                const current = `${get().selectedSubRegionId}|${get().activeArea?.id}|${get().locationSource}`;
                // Ignore the result if the user switched areas while it was loading.
                if (current !== selectionKey || waterShapeEnrichmentRun !== latestWaterShapeEnrichmentRun) return;
                set({
                  selectedAreaSnapshot: refined.snapshot,
                  selectedAreaAlertDetails: [...refined.exactAlerts, ...refined.broaderAlerts],
                });
              })
              .catch(() => undefined);

            void setNotificationRegion(get().selectedRegionId);

            set({
              snapshots,
              rawAlertDetails: alertDetails,
              mapLocationAlerts,
              beachMonitoringPoints: beachPoints,
              mbReadyAlerts,
              hydroOutages,
              selectedAreaSnapshot: localizedResult?.snapshot ?? parentSnapshot,
              selectedAreaAlertDetails: localizedResult ? [...localizedResult.exactAlerts, ...localizedResult.broaderAlerts] : alertDetails,
              isOffline: false,
              isRefreshing: false,
            });

            if (waterEnrichmentCandidates.length) {
              void enrichWaterAdvisoryShapes(waterEnrichmentCandidates, (patches) => {
                if (waterShapeEnrichmentRun !== latestWaterShapeEnrichmentRun || patches.size === 0) {
                  return;
                }

                set((state) => {
                  const nextMapLocationAlerts = patchWaterAlertShapes(state.mapLocationAlerts, patches);
                  const nextRawAlertDetails = patchWaterAlertShapes(state.rawAlertDetails, patches);

                  if (
                    nextMapLocationAlerts === state.mapLocationAlerts &&
                    nextRawAlertDetails === state.rawAlertDetails
                  ) {
                    return state;
                  }

                  const nextSelection = buildSelectedAreaPresentation(
                    state,
                    state.snapshots,
                    nextRawAlertDetails,
                    nextMapLocationAlerts,
                  );

                  return {
                    mapLocationAlerts: nextMapLocationAlerts,
                    rawAlertDetails: nextRawAlertDetails,
                    selectedAreaSnapshot: nextSelection.selectedAreaSnapshot,
                    selectedAreaAlertDetails: nextSelection.selectedAreaAlertDetails,
                  };
                });
              });
            }

            void get().ensurePredictionForRegion(get().selectedRegionId);
            return;
          }
          set({ isOffline: true, isRefreshing: false });
        } catch {
          set({ isOffline: true, isRefreshing: false });
        }
      },
      ensurePredictionForRegion: async (regionId = get().selectedRegionId) => {
        const selectedZone = get().selectedSubRegionId
          ? MANITOBA_SUB_REGIONS.find((zone) => zone.id === get().selectedSubRegionId) ?? null
          : null;
        const activeArea = get().activeArea;
        const shouldUseActiveArea = get().locationSource === 'gps' && Boolean(activeArea);
        const predictionKey = selectedZone?.id ?? (shouldUseActiveArea && activeArea ? activeArea.id : regionId);
        const snapshot =
          selectedZone || shouldUseActiveArea
            ? get().selectedAreaSnapshot ?? get().snapshots[regionId]
            : get().snapshots[regionId];
        if (!snapshot) {
          return;
        }

        set({ isPredictionRefreshing: true });
        try {
          const prediction = await fetchPredictionBundleForTarget(
            selectedZone
              ? {
                  id: selectedZone.id,
                  latitude: selectedZone.center.latitude,
                  longitude: selectedZone.center.longitude,
                }
              : shouldUseActiveArea && activeArea
                ? {
                    id: activeArea.id,
                    latitude: activeArea.center.latitude,
                    longitude: activeArea.center.longitude,
                  }
              : snapshot.region,
            snapshot,
          );
          set((state) => ({
            predictionByRegion: {
              ...state.predictionByRegion,
              [predictionKey]: prediction,
            },
            isPredictionRefreshing: false,
          }));
        } catch {
          set({ isPredictionRefreshing: false });
        }
      },
      setSelectedRegion: async (selectedRegionId, source = 'manual') => {
        const region = getRegionById(selectedRegionId);
        const anchorCoordinates = source === 'gps' ? get().userCoordinates : null;

        set({
          selectedRegionId,
          selectedMapRegionId: selectedRegionId,
          selectedSubRegionId: null,
          isRegionSwitching: true,
          locationSource: source,
          activeArea: buildLocalAreaProfile(region, anchorCoordinates),
          activeSubRegionLabel: null,
          selectedAreaSnapshot: get().snapshots[selectedRegionId] ?? null,
          selectedAreaAlertDetails: get().rawAlertDetails,
        });

        await get().refreshAll();
        void get().ensurePredictionForRegion(selectedRegionId);
        set({ isRegionSwitching: false });
      },
      chooseManualRegion: async (regionId) => {
        set({
          permissionStatus: 'denied',
          locationSource: 'manual',
          showRegionPicker: false,
          selectedSubRegionId: null,
          activeSubRegionLabel: null,
          userCoordinates: null,
          activeArea: buildLocalAreaProfile(getRegionById(regionId)),
          selectedAreaSnapshot: get().snapshots[regionId] ?? null,
          selectedAreaAlertDetails: get().rawAlertDetails,
        });
        await get().setSelectedRegion(regionId, 'manual');
      },
      setSelectedZone: async (zoneId: string, { refresh = true }: { refresh?: boolean } = {}) => {
        const zone: SubRegion | undefined = MANITOBA_SUB_REGIONS.find((z) => z.id === zoneId);
        if (!zone) return;
        const parentSnapshot = get().snapshots[zone.parentRegionId] ?? null;
        const preview = parentSnapshot
          ? buildZoneSnapshotPreview(zone, parentSnapshot, get().rawAlertDetails, get().mapLocationAlerts)
          : null;
        set({
          selectedSubRegionId: zoneId,
          selectedRegionId: zone.parentRegionId,
          selectedMapRegionId: zone.parentRegionId,
          locationSource: 'manual',
          showRegionPicker: false,
          permissionStatus: 'denied',
          userCoordinates: null,
          activeArea: buildZoneAreaProfile(zone),
          activeSubRegionLabel: zone.name,
          selectedAreaSnapshot: preview?.snapshot ?? parentSnapshot,
          selectedAreaAlertDetails: preview ? [...preview.exactAlerts, ...preview.broaderAlerts] : get().rawAlertDetails,
          isOutsideManitoba: false,
          isRegionSwitching: refresh,
        });
        if (!refresh) return;
        await get().refreshAll();
        void get().ensurePredictionForRegion(zone.parentRegionId);
        set({ isRegionSwitching: false });
      },
      locateUser: async ({ refresh = true } = {}) => {
        const result = await detectUserRegion({ prompt: true });

        if (result.permissionStatus !== 'granted') {
          set({ permissionStatus: result.permissionStatus });
          return 'denied';
        }

        if (!result.coordinates) {
          set({ permissionStatus: 'granted', isOutsideManitoba: result.outsideManitoba });
          return result.outsideManitoba ? 'outside' : 'denied';
        }

        const subRegion = findSubRegionByCoordinates(result.coordinates.latitude, result.coordinates.longitude);
        set({
          permissionStatus: 'granted',
          locationSource: 'gps',
          userCoordinates: result.coordinates,
          selectedRegionId: result.region.id,
          selectedMapRegionId: result.region.id,
          selectedSubRegionId: subRegion?.id ?? null,
          activeArea: buildLocalAreaProfile(result.region, result.coordinates),
          activeSubRegionLabel: subRegion ? buildSubRegionLabel(subRegion) : null,
          selectedAreaSnapshot: get().snapshots[result.region.id] ?? null,
          showRegionPicker: false,
          isOutsideManitoba: false,
        });

        if (refresh && get().isInitialized) {
          set({ isRegionSwitching: true });
          await get().refreshAll();
          void get().ensurePredictionForRegion(result.region.id);
          set({ isRegionSwitching: false });
        }
        return 'granted';
      },
      openRegionPicker: () => set({ showRegionPicker: true }),
      replayOnboarding: () => set({ hasCompletedOnboarding: false }),
      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
        // After a replayed tour the location may have changed, so pull fresh data for it.
        if (get().isInitialized) void get().refreshAll();
      },
      dismissRegionPicker: () => set({ showRegionPicker: false }),
      setSelectedMapRegion: (selectedMapRegionId) => set({ selectedMapRegionId }),
      setSelectedAlertFilter: (selectedAlertFilter) => set({ selectedAlertFilter }),
    }),
    {
      name: STORAGE_KEYS.appState,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedRegionId: state.selectedRegionId,
        selectedMapRegionId: state.selectedMapRegionId,
        selectedSubRegionId: state.selectedSubRegionId,
        activeArea: state.activeArea,
        activeSubRegionLabel: state.activeSubRegionLabel,
        selectedAlertFilter: state.selectedAlertFilter,
        permissionStatus: state.permissionStatus,
        locationSource: state.locationSource,
        userCoordinates: state.userCoordinates,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        snapshots: state.snapshots,
      }),
      onRehydrateStorage: () => () => {
        useAppStore.setState({ isHydrated: true });
      },
    },
  ),
);
