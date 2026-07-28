import { API_URLS, STORAGE_KEYS } from '../constants/config';
import { BeachMonitoringPoint } from '../types/alerts';
import { fetchJson, withCacheFallback } from './serviceUtils';

type BeachFeatureAttributes = {
  ObjectId: number;
  Beach_Location: string;
  Beach_Region: string;
  Latitude: number;
  Longitude: number;
  Average_E_coli_Density: number | null;
  Advisory_ecoli: string | null;
  Blue_Green_Algae_Cells: string | null;
  Advisory_Algae: string | null;
  Algal_Toxin_Microcystin: string | null;
  Advisory_microcystin: string | null;
  Sample_Date_E_Coli: number | null;
  Sample_Date_Blue_Green_Algae: number | null;
};

type BeachFeatureResponse = {
  features: Array<{ attributes: BeachFeatureAttributes }>;
};

export const BEACH_ECOLI_GUIDELINE = 200;
export const BEACH_ALGAE_GUIDELINE = 100000;
export const BEACH_MICROCYSTIN_GUIDELINE = 20;

export type BeachStatusTone = 'clear' | 'advisory' | 'warning';

export type BeachMetricStatus = {
  metric: 'E. coli' | 'Blue-Green Algae' | 'Microcystin';
  tone: BeachStatusTone;
  label: string;
  explanation: string;
  reading: number | null;
  guideline: number;
};

export type BeachOverallStatus = {
  tone: BeachStatusTone;
  label: string;
  summary: string;
};

function isActiveAdvisory(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return lower !== 'none' && lower !== '' && lower !== 'n/a';
}

function parseNumericReading(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getHighestBeachStatusTone(tones: BeachStatusTone[]) {
  if (tones.includes('warning')) {
    return 'warning' as const;
  }

  if (tones.includes('advisory')) {
    return 'advisory' as const;
  }

  return 'clear' as const;
}

export function getBeachEcoliStatus(
  beach: Pick<BeachMonitoringPoint, 'ecoliDensity' | 'ecoliAdvisory'>,
): BeachMetricStatus {
  const hasAdvisory = isActiveAdvisory(beach.ecoliAdvisory);
  const isAboveGuideline = beach.ecoliDensity !== null && beach.ecoliDensity > BEACH_ECOLI_GUIDELINE;

  if (isAboveGuideline) {
    return {
      metric: 'E. coli',
      tone: 'warning',
      label: 'Above guideline',
      explanation: `Latest E. coli sample is above ${BEACH_ECOLI_GUIDELINE} per 100 mL.`,
      reading: beach.ecoliDensity,
      guideline: BEACH_ECOLI_GUIDELINE,
    };
  }

  if (hasAdvisory) {
    return {
      metric: 'E. coli',
      tone: 'advisory',
      label: 'Use caution',
      explanation: 'Be careful and double-check current posted beach conditions.',
      reading: beach.ecoliDensity,
      guideline: BEACH_ECOLI_GUIDELINE,
    };
  }

  return {
    metric: 'E. coli',
    tone: 'clear',
    label: 'No advisory',
    explanation: 'No warnings or advisories are posted for E. coli at this beach.',
    reading: beach.ecoliDensity,
    guideline: BEACH_ECOLI_GUIDELINE,
  };
}

export function getBeachAlgaeStatus(
  beach: Pick<BeachMonitoringPoint, 'algaeCells' | 'algaeAdvisory'>,
): BeachMetricStatus {
  const hasAdvisory = isActiveAdvisory(beach.algaeAdvisory);
  const isAboveGuideline = beach.algaeCells !== null && beach.algaeCells > BEACH_ALGAE_GUIDELINE;

  if (isAboveGuideline) {
    return {
      metric: 'Blue-Green Algae',
      tone: 'warning',
      label: 'Above guideline',
      explanation: `Latest cyanobacteria count is above ${BEACH_ALGAE_GUIDELINE.toLocaleString()} cells/mL. Avoid swimming or other contact with the water when blooms are present.`,
      reading: beach.algaeCells,
      guideline: BEACH_ALGAE_GUIDELINE,
    };
  }

  if (hasAdvisory) {
    return {
      metric: 'Blue-Green Algae',
      tone: 'advisory',
      label: 'Use caution',
      explanation:
        'Be careful and double-check current beach conditions. Once an algal bloom is observed, the advisory sign can stay posted for the rest of the beach season even if conditions improve later.',
      reading: beach.algaeCells,
      guideline: BEACH_ALGAE_GUIDELINE,
    };
  }

  return {
    metric: 'Blue-Green Algae',
    tone: 'clear',
    label: 'No advisory',
    explanation: 'No algal warnings or advisories are posted for this beach.',
    reading: beach.algaeCells,
    guideline: BEACH_ALGAE_GUIDELINE,
  };
}

export function getBeachMicrocystinStatus(
  beach: Pick<BeachMonitoringPoint, 'microcystinLevel' | 'microcystinAdvisory'>,
): BeachMetricStatus {
  const reading = parseNumericReading(beach.microcystinLevel);
  const hasAdvisory = isActiveAdvisory(beach.microcystinAdvisory);
  const isAboveGuideline = reading !== null && reading > BEACH_MICROCYSTIN_GUIDELINE;

  if (isAboveGuideline) {
    return {
      metric: 'Microcystin',
      tone: 'warning',
      label: 'Toxin advisory',
      explanation: `Microcystin is above ${BEACH_MICROCYSTIN_GUIDELINE} ug/L. Swimming, drinking, or any contact with the water is not recommended.`,
      reading,
      guideline: BEACH_MICROCYSTIN_GUIDELINE,
    };
  }

  if (hasAdvisory) {
    return {
      metric: 'Microcystin',
      tone: 'advisory',
      label: 'Use caution',
      explanation: 'Be careful and double-check current posted beach conditions.',
      reading,
      guideline: BEACH_MICROCYSTIN_GUIDELINE,
    };
  }

  return {
    metric: 'Microcystin',
    tone: 'clear',
    label: 'No advisory',
    explanation: 'No toxin advisory is posted for this beach.',
    reading,
    guideline: BEACH_MICROCYSTIN_GUIDELINE,
  };
}

export function getBeachOverallStatus(beach: BeachMonitoringPoint): BeachOverallStatus {
  const metricStatuses = [
    getBeachEcoliStatus(beach),
    getBeachAlgaeStatus(beach),
    getBeachMicrocystinStatus(beach),
  ];
  const overallTone = getHighestBeachStatusTone(metricStatuses.map((status) => status.tone));

  if (overallTone === 'warning') {
    const failingMetrics = metricStatuses
      .filter((status) => status.tone === 'warning')
      .map((status) => status.metric);

    return {
      tone: 'warning',
      label: 'Not acceptable',
      summary: `${failingMetrics.join(' and ')} ${failingMetrics.length === 1 ? 'is' : 'are'} above guideline at this beach.`,
    };
  }

  if (overallTone === 'advisory') {
    return {
      tone: 'advisory',
      label: 'Use caution',
      summary:
        'Be careful and double-check current beach conditions. A seasonal advisory can remain posted after earlier elevated readings.',
    };
  }

  return {
    tone: 'clear',
    label: 'No advisory',
    summary: 'No warnings or advisories are reported for this beach.',
  };
}

function parseDateMs(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

export function ecoliRadiusMetres(density: number): number {

  return Math.max(250, Math.min(1200, (density / BEACH_ECOLI_GUIDELINE) * 250));
}

export function algaeRadiusMetres(cells: number): number {

  return Math.max(320, Math.min(1600, (cells / BEACH_ALGAE_GUIDELINE) * 320));
}

export async function fetchBeachMonitoringData(): Promise<BeachMonitoringPoint[]> {
  const { data } = await withCacheFallback<BeachMonitoringPoint[]>('beach', STORAGE_KEYS.beach, async () => {
    const response = await fetchJson<BeachFeatureResponse>(API_URLS.beachMonitoring);

    return response.features
      .map((feature): BeachMonitoringPoint | null => {
        const a = feature.attributes;
        if (!a.Latitude || !a.Longitude) return null;

        const ecoliAdvisory = a.Advisory_ecoli ?? 'None';
        const algaeAdvisory = a.Advisory_Algae ?? 'None';
        const rawAlgaeCells = a.Blue_Green_Algae_Cells ? Number(a.Blue_Green_Algae_Cells) : null;

        return {
          id: a.ObjectId,
          beachName: a.Beach_Location ?? 'Unknown beach',
          region: a.Beach_Region ?? '',
          latitude: a.Latitude,
          longitude: a.Longitude,
          ecoliDensity: a.Average_E_coli_Density,
          ecoliAdvisory,
          algaeCells: rawAlgaeCells !== null && Number.isFinite(rawAlgaeCells) ? rawAlgaeCells : null,
          algaeAdvisory,
          microcystinLevel: a.Algal_Toxin_Microcystin ?? null,
          microcystinAdvisory: a.Advisory_microcystin ?? 'None',
          sampleDateEcoli: parseDateMs(a.Sample_Date_E_Coli),
          sampleDateAlgae: parseDateMs(a.Sample_Date_Blue_Green_Algae),
          hasEcoliAdvisory: isActiveAdvisory(ecoliAdvisory),
          hasAlgaeAdvisory: isActiveAdvisory(algaeAdvisory),
        };
      })
      .filter((point): point is BeachMonitoringPoint => point !== null);
  });

  return data;
}
