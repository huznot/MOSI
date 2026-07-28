export type RiskLevel = 'low' | 'moderate' | 'high';

export type RegionId = 'winnipeg' | 'southern' | 'eastern' | 'western' | 'northern';

export type CategoryId = 'weather' | 'airQuality' | 'wildfire' | 'water' | 'vectorBorne' | 'healthAdvisories';

export type RegionCoordinate = {
  latitude: number;
  longitude: number;
};

export type TrendDirection = 'up' | 'down' | 'flat';

export type LocationSource = 'gps' | 'manual' | 'unknown';

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

export type UserCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp?: string | null;
};

export type LocalAreaProfile = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  parentRegionId: RegionId;
  center: RegionCoordinate;
  polygon: readonly RegionCoordinate[];
  populationTarget: number;
};

export type ManitobaRegion = {
  id: RegionId;
  label: string;
  shortLabel: string;
  description: string;
  latitude: number;
  longitude: number;
  labelCoordinate: RegionCoordinate;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  polygon: readonly RegionCoordinate[];
  holes?: readonly (readonly RegionCoordinate[])[];
};

export type CategoryAlert = {
  category: CategoryId;
  value: number | string;
  riskLevel: RiskLevel;
  summary: string;
  source: string;
  lastUpdated?: string | number | null;
  seasonal?: boolean;
  details?: string[];
  provinceWide?: boolean;
  sourceUrl?: string;
  dataStatus?: 'live' | 'seasonal' | 'reactive' | 'cached' | 'unavailable';
};

export type SafetyBreakdownItem = {
  category: CategoryId;
  riskLevel: RiskLevel;
  numericRisk: number;
  contribution: number;
  weight: number;
};

export type SafetyIndexResult = {
  overallScore: number;
  overallRisk: RiskLevel;
  breakdown: SafetyBreakdownItem[];
};

export type RegionSnapshot = {
  region: ManitobaRegion;
  alerts: Record<CategoryId, CategoryAlert>;
  safetyIndex: SafetyIndexResult;
  fetchedAt: string;
};

export type AlertDetail = {
  id: string;
  category: CategoryId;
  title: string;
  summary: string;
  description: string;
  source: string;
  sourceUrl?: string;
  authority: string;
  geographicScope: string;
  riskLevel: RiskLevel;
  issuedAt?: string | number | null;
  updatedAt?: string | number | null;
  distanceKm?: number | null;
  coordinates?: RegionCoordinate;
  impactRadiusMetres?: number | null;
  impactPolygon?: RegionCoordinate[] | null;
  regionIds: RegionId[];
  recommendedActions: string[];
};

export type BeachMonitoringPoint = {
  id: number;
  beachName: string;
  region: string;
  latitude: number;
  longitude: number;
  ecoliDensity: number | null;
  ecoliAdvisory: string;
  algaeCells: number | null;
  algaeAdvisory: string;
  microcystinLevel: string | null;
  microcystinAdvisory: string;
  sampleDateEcoli: string | null;
  sampleDateAlgae: string | null;
  hasEcoliAdvisory: boolean;
  hasAlgaeAdvisory: boolean;
};

export type MbReadySeverity = 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown';

export type MbReadyAlert = {
  id: string;
  title: string;
  headline: string;
  event: string;
  severity: MbReadySeverity;
  urgency: string;
  areaDesc: string;
  effective: string | null;
  expires: string | null;
  description: string;
  polygon: RegionCoordinate[] | null;
  senderName: string;
  capCategory: string;
};

export type HydroOutage = {
  id: string;
  outageType: string;
  timeOfOutage: string | null;
  estimatedRestoration: string | null;
  customersAffected: number;
  customersAffectedLabel: string;
  cause: string;
  crewStatus: string;
  polygon: RegionCoordinate[];
  centroid: RegionCoordinate;
};

export type CachedServiceResponse<T> = {
  data: T;
  cachedAt: string;
};

export type PredictionDay = {
  isoDate: string;
  label: string;
  summary: string;
  icon: string;
  highC: number | null;
  lowC: number | null;
  score: number;
  riskLevel: RiskLevel;
};

export type PredictionDayDetail = {
  isoDate: string;
  headline: string;
  narrative: string;
  confidenceLabel: string;
  categoryScores: Record<CategoryId, number>;
  categoryRiskLevels: Record<CategoryId, RiskLevel>;
  drivers: Array<{
    title: string;
    detail: string;
  }>;
  chartSeries: Array<{
    label: string;
    values: number[];
  }>;
};

export type CategoryPrediction = {
  category: CategoryId;
  sourceType: 'forecast' | 'seasonal' | 'live';
  summary: string;
  values: number[];
  riskLevels: RiskLevel[];
};

export type PredictionBundle = {
  regionId: string;
  modelVersion: string;
  generatedAt: string;
  days: PredictionDay[];
  dayDetails: Record<string, PredictionDayDetail>;
  categories: Record<CategoryId, CategoryPrediction>;
  about: string[];
};
