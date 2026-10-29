import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { alarmTags, recentAlarms } from '@/lib/alarms';
import { ALARMS_DASHBOARD, dashboardUrl, toPeriod } from '@/lib/kibana';
import PeriodSelector from '@/components/PeriodSelector';

const MAX_LISTED = 200;

export default async function AlarmsViewer({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser();
  const period = toPeriod((await searchParams).period);
  let alarms: Awaited<ReturnType<typeof recentAlarms>> = [];
  try {
    alarms = await recentAlarms(period, MAX_LISTED);
  } catch (err) {
    console.error('loading recent alarms failed:', err);
  }

  return (
    <div className="page wide">
      <h1>Alarms</h1>
      <PeriodSelector path="/viewer" current={period} kibanaUrl={dashboardUrl(ALARMS_DASHBOARD, period, false)} />
      <iframe key={period} className="dashboard" title="Alarms" src={dashboardUrl(ALARMS_DASHBOARD, period, true)} />

      <h2>Recent alarms</h2>
      {alarms.length === 0 && <p className="muted">No alarms in the last {period}.</p>}
      {alarms.length === MAX_LISTED && <p className="muted small">Showing the latest {MAX_LISTED}.</p>}
      {alarms.length > 0 && (
        <table className="stack">
          <thead>
            <tr><th>Created (UTC)</th><th>Category</th><th>Subcategory</th><th>Event</th><th>Body</th><th>Tags</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {alarms.map((a) => (
              <tr key={a.id}>
                <td className="nowrap" data-label="Created">
                  <Link href={`/alarms/${encodeURIComponent(a.id)}`}>
                    {new Date(a.created_at).toISOString().slice(0, 19).replace('T', ' ')}
                  </Link>
                </td>
                <td data-label="Category">{a.category}</td>
                <td data-label="Subcategory">{a.subcategory}</td>
                <td data-label="Event">{a.event}</td>
                <td data-label="Body">{a.body}</td>
                <td data-label="Tags">{alarmTags(a).join(', ')}</td>
                <td data-label="Notes">{a.annotations?.length || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
