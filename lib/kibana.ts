// Shared between server and client code.

export const KIBANA = 'https://atlas-kibana.mwt2.org:5601/s/aaas';

export const ALARMS_DASHBOARD = 'f3055010-2af1-11ed-afcf-d91dad577662';
export const HEARTBEATS_DASHBOARD = 'cf438520-2afb-11ed-afcf-d91dad577662';

export const PERIODS = ['1h', '6h', '24h', '7d', '30d'] as const;
export type Period = (typeof PERIODS)[number];

export function toPeriod(p: string | string[] | undefined): Period {
  return PERIODS.find((x) => x === p) ?? '7d';
}

/** Quotes a string for Kibana's rison URL state. */
function rison(s: string): string {
  return `'${s.replace(/!/g, '!!').replace(/'/g, "!'")}'`;
}

function kql(fields: Record<string, string>): string {
  return Object.entries(fields).map(([k, v]) => `${k}:"${v.replace(/(["\\])/g, '\\$1')}"`).join(' and ');
}

export function dashboardUrl(id: string, period: Period, embed: boolean): string {
  const g = `(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-${period},to:now))`;
  const embedding = embed ? 'embed=true&' : '';
  return `${KIBANA}/app/dashboards?auth_provider_hint=anonymous1#/view/${id}?${embedding}_g=${encodeURIComponent(g)}&show-time-filter=true&hide-filter-bar=true`;
}

/** Discover link showing documents of one topology around a moment in time. */
export function discoverUrl(fields: Record<string, string>, at: number, hoursAround = 6): string {
  const from = new Date(at - hoursAround * 3.6e6).toISOString();
  const to = new Date(at + hoursAround * 3.6e6).toISOString();
  const g = `(time:(from:${rison(from)},to:${rison(to)}))`;
  const a = `(query:(language:kuery,query:${rison(kql(fields))}))`;
  return `${KIBANA}/app/discover?auth_provider_hint=anonymous1#/?_g=${encodeURIComponent(g)}&_a=${encodeURIComponent(a)}`;
}
