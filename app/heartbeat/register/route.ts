import { getConfig } from '@/lib/config';
import { es, INDICES } from '@/lib/es';
import { hasHeartbeatTopology, loadHeartbeatTopology } from '@/lib/heartbeats';
import { pick, readBody, requireFields, text } from '@/lib/http';

// Registers a new heartbeat category.
export async function POST(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const fields = getConfig().REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS;
  const missing = requireFields(b, fields);
  if (missing) return missing;

  const category = pick(b, fields);
  if (await hasHeartbeatTopology(category, true)) {
    return text('Already registered. Use PATCH to edit it.\n');
  }

  try {
    await es().index({ index: INDICES.heartbeatTopology, document: category, refresh: true });
    await loadHeartbeatTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in registering heartbeat.', 500);
  }
}
