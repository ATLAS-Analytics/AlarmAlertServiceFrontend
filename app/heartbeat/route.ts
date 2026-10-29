import { getConfig } from '@/lib/config';
import { es, INDICES } from '@/lib/es';
import { hasHeartbeatTopology, loadHeartbeatTopology } from '@/lib/heartbeats';
import { pick, readBody, requireFields, text, topologySelector, updateScript } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Lists registered heartbeat categories.
export async function GET() {
  return Response.json(await loadHeartbeatTopology());
}

// Accepts a heartbeat.
export async function POST(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const config = getConfig();
  const missing = requireFields(b, config.REQUIRED_HEARTBEAT_FIELDS);
  if (missing) return missing;

  const heartbeat = pick(b, [...config.REQUIRED_HEARTBEAT_FIELDS, ...config.OPTIONAL_HEARTBEAT_FIELDS]);
  if (!(await hasHeartbeatTopology(heartbeat))) {
    return text('no such category, subcategory or event allowed.', 400);
  }
  heartbeat.created_at = Date.now();

  try {
    await es().index({ index: INDICES.heartbeats, document: heartbeat });
    return text('OK');
  } catch (err) {
    console.error('cant index heartbeat:\n', heartbeat, err);
    return text('Error in indexing heartbeat.', 500);
  }
}

// Edits an existing heartbeat category.
export async function PATCH(req: Request) {
  const b = await readBody(req, 'PATCHed');
  if (b instanceof Response) return b;
  const config = getConfig();
  const missing = requireFields(b, config.TOPOLOGY_FIELDS);
  if (missing) return missing;

  if (!(await hasHeartbeatTopology(b))) {
    return text('no such category, subcategory or event allowed.', 400);
  }

  try {
    await es().updateByQuery({
      index: INDICES.heartbeatTopology,
      script: updateScript(pick(b, config.REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS)),
      query: { bool: { must: topologySelector(b) } },
      refresh: true,
    });
    await loadHeartbeatTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in updating heartbeat category.', 500);
  }
}

// Unregisters a heartbeat category.
export async function DELETE(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const missing = requireFields(b, getConfig().TOPOLOGY_FIELDS);
  if (missing) return missing;

  try {
    const response = await es().deleteByQuery({
      index: INDICES.heartbeatTopology,
      query: { bool: { must: topologySelector(b) } },
      refresh: true,
    });
    if (!response.deleted) return text('No heartbeats like that.', 404);
    await loadHeartbeatTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in deleting heartbeat.', 500);
  }
}
