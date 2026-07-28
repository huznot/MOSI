import { STORAGE_KEYS } from '../constants/config';
import { MbReadyAlert, MbReadySeverity, RegionCoordinate } from '../types/alerts';
import { fetchText, readFreshCache, writeCache } from './serviceUtils';

const NAAD_ATOM_URL = 'http://rss.naad-adna.pelmorex.com';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CAP_FETCHES = 10;
const MB_LAT_MIN = 48.9;
const MB_LAT_MAX = 60.2;
const MB_LON_MIN = -102.2;
const MB_LON_MAX = -87.8;

function tagFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function tagAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
  }
  return results;
}

function extractHref(entryXml: string): string | null {
  const m = entryXml.match(/<link[^>]+href="([^"]+)"/i);
  return m ? m[1] : null;
}

// ── CAP data parsing ────────────────────────────────────────────────────────

function parseCapPolygon(raw: string): RegionCoordinate[] | null {
  const pairs = raw.trim().split(/\s+/);
  const coords: RegionCoordinate[] = [];
  for (const pair of pairs) {
    const parts = pair.split(',');
    if (parts.length < 2) continue;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      coords.push({ latitude: lat, longitude: lon });
    }
  }
  return coords.length >= 3 ? coords : null;
}

function touchesManitoba(polygon: RegionCoordinate[]): boolean {
  return polygon.some(
    (p) =>
      p.latitude >= MB_LAT_MIN &&
      p.latitude <= MB_LAT_MAX &&
      p.longitude >= MB_LON_MIN &&
      p.longitude <= MB_LON_MAX,
  );
}

function parseSeverity(raw: string | null): MbReadySeverity {
  switch (raw?.toLowerCase()) {
    case 'extreme':  return 'extreme';
    case 'severe':   return 'severe';
    case 'moderate': return 'moderate';
    case 'minor':    return 'minor';
    default:         return 'unknown';
  }
}

function parseCapXml(id: string, capXml: string): MbReadyAlert | null {
  const status  = tagFirst(capXml, 'status');
  const msgType = tagFirst(capXml, 'msgType');

  if (!status  || status.toLowerCase()  !== 'actual') return null;
  if (!msgType || !['alert', 'update'].includes(msgType.toLowerCase())) return null;

  // Prefer the English info block
  const infoBlocks = tagAll(capXml, 'info');
  let info: string | null = null;
  for (const block of infoBlocks) {
    const lang = tagFirst(block, 'language') ?? '';
    if (lang.toLowerCase().startsWith('en')) { info = block; break; }
  }
  if (!info) info = infoBlocks[0] ?? null;
  if (!info) return null;

  const severity = parseSeverity(tagFirst(info, 'severity'));
  // Skip very minor alerts — they rarely affect outdoor safety meaningfully
  if (severity === 'unknown' || severity === 'minor') return null;

  const polygonStr = tagFirst(info, 'polygon');
  const polygon    = polygonStr ? parseCapPolygon(polygonStr) : null;

  const areaDesc = tagFirst(info, 'areaDesc') ?? '';

  // Must either have a Manitoba-touching polygon OR mention Manitoba in area description
  if (polygon) {
    if (!touchesManitoba(polygon)) return null;
  } else {
    if (!areaDesc.toLowerCase().includes('manitoba') && !areaDesc.toLowerCase().includes(' mb ')) return null;
  }

  const headline    = tagFirst(info, 'headline') ?? tagFirst(capXml, 'identifier') ?? id;
  const description = (tagFirst(info, 'description') ?? '').slice(0, 800).trim();

  return {
    id,
    title:       headline,
    headline,
    event:       tagFirst(info, 'event')      ?? 'Emergency Alert',
    severity,
    urgency:     tagFirst(info, 'urgency')    ?? 'Unknown',
    areaDesc,
    effective:   tagFirst(info, 'effective'),
    expires:     tagFirst(info, 'expires'),
    description,
    polygon,
    senderName:  tagFirst(info, 'senderName') ?? 'Government of Canada',
    capCategory: tagFirst(info, 'category')   ?? 'Met',
  };
}

// ── Concurrency helper ──────────────────────────────────────────────────────

async function batchedSettle<T>(
  tasks: Array<() => Promise<T | null>>,
  batchSize: number,
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = await Promise.all(tasks.slice(i, i + batchSize).map((t) => t().catch(() => null)));
    results.push(...batch);
  }
  return results;
}

// ── Public API ──────────────────────────────────────────────────────────────

export type { MbReadyAlert };

export async function fetchMbReadyAlerts(): Promise<MbReadyAlert[]> {
  // Serve from cache when fresh enough
  const cached = await readFreshCache<MbReadyAlert[]>(STORAGE_KEYS.mbReadyAlerts, CACHE_TTL_MS);
  if (cached) return cached.data;

  try {
    const atomXml = await fetchText(NAAD_ATOM_URL);

    // Extract all <entry> blocks
    const entryBlocks: string[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRe.exec(atomXml)) !== null) entryBlocks.push(m[1]);

    if (!entryBlocks.length) return [];

    // Pre-filter: keep entries that mention Manitoba in title or summary
    const mbEntries = entryBlocks.filter((block) => {
      const text = ((tagFirst(block, 'title') ?? '') + ' ' + (tagFirst(block, 'summary') ?? '')).toLowerCase();
      return text.includes('manitoba') || text.includes(' mb ') || text.includes(',mb') || text.length < 10;
    });

    const candidates = mbEntries.slice(0, MAX_CAP_FETCHES);

    const tasks = candidates.map((block) => async (): Promise<MbReadyAlert | null> => {
      const href = extractHref(block);
      if (!href) return null;
      const id = tagFirst(block, 'id') ?? href;
      try {
        const capXml = await fetchText(href);
        return parseCapXml(id, capXml);
      } catch {
        return null;
      }
    });

    const results = await batchedSettle(tasks, 3);
    const alerts  = results.filter((r): r is MbReadyAlert => r !== null);

    await writeCache(STORAGE_KEYS.mbReadyAlerts, alerts);
    return alerts;
  } catch {
    // Network failure — return whatever is still in cache (even stale)
    const stale = await readFreshCache<MbReadyAlert[]>(STORAGE_KEYS.mbReadyAlerts, 24 * 60 * 60 * 1000);
    return stale?.data ?? [];
  }
}
