import { getConfig } from '@/lib/config';
import { es, INDICES } from '@/lib/es';
import { hasAlarmTopology, loadAlarmTopology } from '@/lib/alarms';
import { pick, readBody, requireFields, text, topologySelector } from '@/lib/http';

// Creates an alarm.
export async function POST(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const config = getConfig();
  const missing = requireFields(b, config.REQUIRED_ALARM_FIELDS);
  if (missing) return missing;

  const alarm = pick(b, [...config.REQUIRED_ALARM_FIELDS, ...config.OPTIONAL_ALARM_FIELDS]);
  if (!(await hasAlarmTopology(alarm))) {
    return text('no such category, subcategory or event allowed.', 400);
  }
  alarm.created_at = Date.now();

  try {
    await es().index({ index: INDICES.alarms, document: alarm });
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in indexing alarm.', 500);
  }
}

// Deletes an alarm category.
export async function DELETE(req: Request) {
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const missing = requireFields(b, getConfig().TOPOLOGY_FIELDS);
  if (missing) return missing;

  try {
    const response = await es().deleteByQuery({
      index: INDICES.alarmTopology,
      query: { bool: { must: topologySelector(b) } },
      refresh: true,
    });
    if (!response.deleted) return text('No alarm category like that.', 404);
    await loadAlarmTopology();
    return text('OK');
  } catch (err) {
    console.error(err);
    return text('Error in deleting alarm category.', 500);
  }
}
