import { getConfig } from '@/lib/config';
import { es, INDICES } from '@/lib/es';
import { hasAlarmTopology, loadAlarmTopology } from '@/lib/alarms';
import { pick, readBody, requireFields, text, topologySelector, updateScript } from '@/lib/http';

// Registers a new alarm category.
export async function POST(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const fields = getConfig().REQUIRED_ALARM_TOPOLOGY_FIELDS;
  const missing = requireFields(b, fields);
  if (missing) return missing;

  const category = pick(b, fields);
  if (await hasAlarmTopology(category)) {
    return text('Already registered. Use PATCH to edit it.\n');
  }

  try {
    const response = await es().index({ index: INDICES.alarmTopology, document: category, refresh: true });
    console.log(`Category adding result: ${response.result}`);
    if (response.result !== 'created') return text(response.result, 500);
    await loadAlarmTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in registering alarm category.', 500);
  }
}

// Edits description/template of an existing alarm category.
export async function PATCH(req: Request) {
  const b = await readBody(req, 'PATCHed');
  if (b instanceof Response) return b;
  const config = getConfig();
  const missing = requireFields(b, config.TOPOLOGY_FIELDS);
  if (missing) return missing;

  if (!(await hasAlarmTopology(b))) {
    return text('no such category, subcategory or event allowed.', 400);
  }

  try {
    await es().updateByQuery({
      index: INDICES.alarmTopology,
      script: updateScript(pick(b, config.REQUIRED_ALARM_TOPOLOGY_FIELDS)),
      query: { bool: { must: topologySelector(b) } },
      refresh: true,
    });
    await loadAlarmTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in updating alarm category.', 500);
  }
}
