import 'server-only';
import { es, INDICES, sources } from './es';
import { getConfig } from './config';
import type { AlarmCategory } from './types';
import type { Body } from './http';

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

/** Checks the cached categories, reloading once in case one was just registered elsewhere. */
export async function hasAlarmTopology(b: Body): Promise<boolean> {
  if (g.aaasAlarmCategories && matches(g.aaasAlarmCategories, b)) return true;
  return matches(await loadAlarmTopology(), b);
}
