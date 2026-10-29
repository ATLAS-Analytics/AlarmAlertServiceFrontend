import { getConfig } from '@/lib/config';
import { es, INDICES, sources } from '@/lib/es';
import { readBody, requireFields, text, topologySelector } from '@/lib/http';

// Returns alarms of a category created in the last `period` hours.
export async function POST(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const missing = requireFields(b, getConfig().TOPOLOGY_FIELDS);
  if (missing) return missing;
  const period = Number(b.period);
  if (!(period > 0)) return text('period is required. Just number of hours.\n', 400);

  try {
    const response = await es().search({
      index: INDICES.alarms,
      size: 1000,
      query: {
        bool: {
          must: [...topologySelector(b), { range: { created_at: { gte: `now-${period}h/h` } } }],
        },
      },
    });
    return Response.json(sources(response.hits.hits));
  } catch (err) {
    console.error(err);
    return Response.json([]);
  }
}
