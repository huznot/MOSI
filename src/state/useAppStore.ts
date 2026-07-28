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
import {
  cacheOfflineAlertPayload,
  primeOfflineLocationMonitor,
  registerNotifications,
} from '../services/notificationService';
import { wait } from '../services/serviceUtils';
import {
  buildLocalAreaSnapshotPreview,
  buildZoneSnapshotPreview,
  fetchLocalAreaSnapshot,
  fetchZoneSnapshot,
} from '../services/zoneSnapshotService';
import { enrichWaterAdvisoryShapes, getWaterSiteIdentity } from '../services/waterAdvisoryService';

type FilterValue = CategoryId | 'all';

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
  setSelectedZone: (zoneId: string) => Promise<void>;
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
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
        airQuality: {
          category: 'airQuality',
          value: 'n/a',
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
        wildfire: {
          category: 'wildfire',
          value: 'n/a',
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
        water: {
          category: 'water',
          value: 'n/a',
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
        vectorBorne: {
          category: 'vectorBorne',
          value: 'n/a',
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
        healthAdvisories: {
          category: 'healthAdvisories',
          value: 'n/a',
          riskLevel: 'moderate',
          summary: 'Data temporarily unavailable',
          source: 'Waiting for first sync',
          lastUpdated: fallbackTimestamp,
        },
      },
      safetyIndex: {
        overallScore: 2,
        overallRisk: 'moderate',
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
        const locationResult = await detectUserRegion();

        if (locationResult.permissionStatus === 'granted' && locationResult.coordinates) {
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
            showRegionPicker: get().locationSource !== 'manual',
          });
        }

        registerNotifications().catch(() => undefined);

        await get().refreshAll();
        await get().ensurePredictionForRegion(initialRegionId);
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
            const localizedResult =
              selectedZone && parentSnapshot
                ? await fetchZoneSnapshot(selectedZone, parentSnapshot, alertDetails, mapLocationAlerts).catch(() =>
                    buildZoneSnapshotPreview(selectedZone, parentSnapshot, alertDetails, mapLocationAlerts),
                  )
                : shouldLocalizeActiveArea && activeArea && parentSnapshot
                  ? await fetchLocalAreaSnapshot(activeArea, parentSnapshot, alertDetails, mapLocationAlerts).catch(() =>
                      buildLocalAreaSnapshotPreview(activeArea, parentSnapshot, alertDetails, mapLocationAlerts),
                    )
                : null;

            await cacheOfflineAlertPayload(snapshots, alertDetails, mapLocationAlerts);
            await primeOfflineLocationMonitor(get().userCoordinates);

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

            await get().ensurePredictionForRegion(get().selectedRegionId);
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
        await get().ensurePredictionForRegion(selectedRegionId);
        await wait(220);
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
      setSelectedZone: async (zoneId: string) => {
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
          isRegionSwitching: true,
        });
        await get().refreshAll();
        await get().ensurePredictionForRegion(zone.parentRegionId);
        await wait(220);
        set({ isRegionSwitching: false });
      },
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
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
