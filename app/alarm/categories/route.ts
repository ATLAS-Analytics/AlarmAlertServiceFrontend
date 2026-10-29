import { loadAlarmTopology } from '@/lib/alarms';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(await loadAlarmTopology());
}
