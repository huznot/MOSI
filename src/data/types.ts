export type DomainId = 'air' | 'water' | 'vectors' | 'heat';
export type DomainFilter = DomainId | 'all';
export type RiskLabel = 'Low' | 'Med' | 'High';
export type TrendDirection = 'up' | 'down' | 'flat';
export type PriorityTier = 'Tier 1' | 'Tier 2' | 'Tier 3';

export type Region = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  northFactor: number;
  waterFactor: number;
  airFactor: number;
  vectorFactor: number;
};

export type DomainRiskData = {
  score: number;
  baseline: number;
  label: RiskLabel;
  features: Record<string, number>;
};

export type WeeklyRegionRecord = {
  weekIndex: number;
  date: string;
  domains: Record<DomainId, DomainRiskData>;
};

export type AppDataset = {
  seed: string;
  weeks: string[];
  regions: Region[];
  history: Record<string, WeeklyRegionRecord[]>;
};

export type PriorityItem = {
  domain: DomainId;
  region: string;
  score: number;
  trend: number;
  tier: PriorityTier;
  share: number;
  weight: number;
};

export type AlertItem = {
  id: string;
  domain: DomainId;
  region: string;
  title: string;
  severity: RiskLabel;
  timeLabel: string;
  explanation: string;
  actions: string[];
  score: number;
  trend: number;
};
