import 'server-only';
import type { estypes } from '@elastic/elasticsearch';
import { es, INDICES, sources } from './es';
import { getConfig } from './config';
import { topologySelector, type Body } from './http';
import type { HeartbeatCategory } from './types';

/*
 * Every registered heartbeat category gets a timer that runs every `interval` seconds.
 * It compares heartbeats received in the previous interval with those in the current one,
 * grouped by their `source`. A source that sent at least `min_expected` heartbeats before,
 * but not anymore, gets an alarm indexed.
 */

interface Monitor {
  def: HeartbeatCategory;
  timer: NodeJS.Timeout;
}

type SourceGroup = Record<string, unknown> & { count: number };

// Kept on globalThis: Next.js may load this module in several bundles of the same process.
const g = globalThis as unknown as { aaasHeartbeatMonitors?: Map<string, Monitor> };

function monitors(): Map<string, Monitor> {
  g.aaasHeartbeatMonitors ??= new Map();
  return g.aaasHeartbeatMonitors;
}

function keyOf(c: Body): string {
  return JSON.stringify(getConfig().TOPOLOGY_FIELDS.map((f) => c[f]));
}

function countBySource(srcs: Record<string, unknown>[]): SourceGroup[] {
  const groups: SourceGroup[] = [];
  srcs.forEach((src) => {
    let found = false;
    groups.forEach((group) => {
      if (Object.keys(src).every((k) => k in group && group[k] === src[k])) {
        group.count += 1;
        found = true;
      }
    });
    if (!found) groups.push({ ...src, count: 1 });
  });
  return groups;
}

async function createAlarmsIfNeeded(c: HeartbeatCategory, oldSrcs: Record<string, unknown>[], newSrcs: Record<string, unknown>[]) {
  const cNew = countBySource(newSrcs);
  for (const o of countBySource(oldSrcs)) {
    if (o.count < c.min_expected) continue; // was already alerted
    const stillAlive = cNew.some((n) => n.count >= c.min_expected
      && Object.keys(o).every((k) => k === 'count' || (k in n && n[k] === o[k])));
    if (stillAlive) continue;
    const alarm = {
      category: c.category,
      subcategory: c.subcategory,
      event: c.event,
      created_at: Date.now(),
      source: { ...o, interval: c.interval, min_expected: c.min_expected },
    };
    try {
      await es().index({ index: INDICES.alarms, document: alarm });
      console.log('New HB alarm indexed.');
    } catch (err) {
      console.error('cant index alarm:\n', alarm, err);
    }
  }
}

async function heartbeatSources(must: estypes.QueryDslQueryContainer[]): Promise<Record<string, unknown>[]> {
  const response = await es().search<{ source?: Record<string, unknown> }>({
    index: INDICES.heartbeats,
    size: 10000,
    query: { bool: { must } },
  });
  return sources(response.hits.hits).map((h) => h.source ?? {});
}

async function checkHeartbeat(key: string) {
  const c = monitors().get(key)?.def;
  if (!c) return;
  try {
    const [oldSrcs, newSrcs] = await Promise.all([
      heartbeatSources([
        ...topologySelector(c),
        { range: { created_at: { gte: `now-${c.interval * 2}s/s`, lte: `now-${c.interval}s/s` } } },
      ]),
      heartbeatSources([
        ...topologySelector(c),
        { range: { created_at: { gte: `now-${c.interval}s/s` } } },
      ]),
    ]);
    await createAlarmsIfNeeded(c, oldSrcs, newSrcs);
  } catch (err) {
    console.error('checking heartbeat failed:', c.category, c.subcategory, c.event, err);
  }
}

/** Loads registered heartbeat categories and (re)starts/stops their monitors to match. */
export async function loadHeartbeatTopology(): Promise<HeartbeatCategory[]> {
  const live = monitors();
  let defs: HeartbeatCategory[];
  try {
    const response = await es().search<HeartbeatCategory>({
      index: INDICES.heartbeatTopology,
      size: 1000,
      query: { match_all: {} },
    });
    defs = sources(response.hits.hits);
  } catch (err) {
    console.error('loading heartbeat categories failed:', err);
    return [...live.values()].map((m) => m.def);
  }

  const seen = new Set<string>();
  defs.forEach((def) => {
    const key = keyOf(def);
    seen.add(key);
    const existing = live.get(key);
    if (existing && Number(existing.def.interval) === Number(def.interval)) {
      existing.def = def;
      return;
    }
    if (existing) clearInterval(existing.timer);
    const seconds = Number(def.interval);
    if (!(seconds > 0)) {
      console.error('heartbeat has invalid interval, not monitoring:', def);
      live.delete(key);
      return;
    }
    console.log('monitoring heartbeat:', def.category, def.subcategory, def.event, `every ${seconds}s`);
    live.set(key, { def, timer: setInterval(() => { void checkHeartbeat(key); }, seconds * 1000) });
  });
  live.forEach((m, key) => {
    if (!seen.has(key)) {
      console.log('stopped monitoring heartbeat:', m.def.category, m.def.subcategory, m.def.event);
      clearInterval(m.timer);
      live.delete(key);
    }
  });
  return defs;
}

/** Checks the monitored categories, reloading once in case one was just registered elsewhere. */
export async function hasHeartbeatTopology(b: Body): Promise<boolean> {
  if (monitors().has(keyOf(b))) return true;
  await loadHeartbeatTopology();
  return monitors().has(keyOf(b));
}
