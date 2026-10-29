import 'server-only';
import type { estypes } from '@elastic/elasticsearch';
import { getConfig } from './config';

export type Body = Record<string, unknown>;

export function text(message: string, status = 200): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Relative Location keeps redirects correct behind the ingress.
export function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/** Parses a non-empty JSON object body, or returns a 400 response. */
export async function readBody(req: Request, verb = 'POSTed'): Promise<Body | Response> {
  let b: unknown;
  try {
    b = await req.json();
  } catch {
    b = null;
  }
  if (b === null || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length === 0) {
    return text(`nothing ${verb}.\n`, 400);
  }
  return b as Body;
}

/** Returns a 400 response naming the first missing field, if any. */
export function requireFields(b: Body, fields: string[]): Response | undefined {
  const missing = fields.find((f) => b[f] === undefined || b[f] === null);
  return missing ? text(`${missing} is required.\n`, 400) : undefined;
}

export function pick(b: Body, allowed: string[]): Body {
  return Object.fromEntries(Object.entries(b).filter(([key]) => allowed.includes(key)));
}

export function topologySelector(b: Body): estypes.QueryDslQueryContainer[] {
  return getConfig().TOPOLOGY_FIELDS.map((f) => ({ term: { [f]: b[f] as estypes.FieldValue } }));
}

/** Painless script that overwrites the given fields of a document. */
export function updateScript(fields: Body) {
  return {
    lang: 'painless',
    source: Object.keys(fields).map((_, i) => `ctx._source[params.k${i}] = params.v${i};`).join(' '),
    params: Object.fromEntries(Object.entries(fields).flatMap(([k, v], i) => [[`k${i}`, k], [`v${i}`, v]])),
  };
}
