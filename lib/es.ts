import 'server-only';
import { Client } from '@elastic/elasticsearch';
import { getConfig } from './config';

export const INDICES = {
  alarms: 'aaas_alarms',
  alarmTopology: 'aaas_categories',
  heartbeats: 'aaas_heartbeats',
  heartbeatTopology: 'aaas_heartbeats_topology',
  users: 'aaas_users',
} as const;

const g = globalThis as unknown as { aaasEs?: Client };

export function es(): Client {
  if (!g.aaasEs) g.aaasEs = new Client(getConfig().ES_HOST);
  return g.aaasEs;
}

export function sources<T>(hits: { _source?: T }[]): T[] {
  return hits.flatMap((h) => (h._source === undefined ? [] : [h._source]));
}

export function esStatus(err: unknown): number | undefined {
  return (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
}
