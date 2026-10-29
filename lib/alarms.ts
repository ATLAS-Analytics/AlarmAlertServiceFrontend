import 'server-only';
import { es, esStatus, INDICES, sources } from './es';
import { getConfig } from './config';
import type { Alarm, AlarmCategory, Topology } from './types';
import type { Body } from './http';
import type { Period } from './kibana';

const g = globalThis as unknown as { aaasAlarmCategories?: AlarmCategory[] };

export async function loadAlarmTopology(): Promise<AlarmCategory[]> {
  try {
    const response = await es().search<AlarmCategory>({
      index: INDICES.alarmTopology,
      size: 1000,
      query: { match_all: {} },
    });
    g.aaasAlarmCategories = sources(response.hits.hits);
  } catch (err) {
    console.error('loading alarm categories failed:', err);
  }
  return g.aaasAlarmCategories ?? [];
}

function matches(categories: AlarmCategory[], b: Body): boolean {
  const fields = getConfig().TOPOLOGY_FIELDS;
  return categories.some((c) => fields.every((f) => c[f] === b[f]));
}

/**
 * Checks the cached categories, reloading once in case one was just registered elsewhere.
 * `fresh` skips the cache, e.g. before registering.
 */
export async function hasAlarmTopology(b: Body, fresh = false): Promise<boolean> {
  if (!fresh && g.aaasAlarmCategories && matches(g.aaasAlarmCategories, b)) return true;
  return matches(await loadAlarmTopology(), b);
}

export async function getAlarm(id: string): Promise<Alarm | undefined> {
  try {
    return (await es().get<Alarm>({ index: INDICES.alarms, id }))._source;
  } catch (err) {
    if (esStatus(err) === 404) return undefined;
    throw err;
  }
}

export async function recentAlarms(period: Period, size = 200): Promise<(Alarm & { id: string })[]> {
  const response = await es().search<Alarm>({
    index: INDICES.alarms,
    size,
    sort: [{ created_at: 'desc' }],
    query: { range: { created_at: { gte: `now-${period}` } } },
  });
  return response.hits.hits.flatMap((h) => (h._source && h._id ? [{ ...h._source, id: h._id }] : []));
}

export function alarmTags(a: Pick<Alarm, 'tag' | 'tags'>): string[] {
  return [a.tags, a.tag].flat().filter((t): t is string => typeof t === 'string' && t.length > 0);
}

/** Distinct tags (usually site names) seen in recent alarms of a topology. */
export async function recentTags(t: Topology): Promise<string[]> {
  const response = await es().search<Alarm>({
    index: INDICES.alarms,
    size: 1000,
    sort: [{ created_at: 'desc' }],
    _source: ['tag', 'tags'],
    query: {
      bool: {
        must: [
          { term: { category: t.category } },
          { term: { subcategory: t.subcategory } },
          { term: { event: t.event } },
          { range: { created_at: { gte: 'now-30d' } } },
        ],
      },
    },
  });
  return [...new Set(sources(response.hits.hits).flatMap(alarmTags))].sort();
}
