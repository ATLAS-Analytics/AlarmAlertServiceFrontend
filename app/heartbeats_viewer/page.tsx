import { requireUser } from '@/lib/auth';
import { dashboardUrl, HEARTBEATS_DASHBOARD, toPeriod } from '@/lib/kibana';
import PeriodSelector from '@/components/PeriodSelector';

export default async function HeartbeatsViewer({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser();
  const period = toPeriod((await searchParams).period);
  return (
    <div className="page wide">
      <h1>Heartbeats</h1>
      <PeriodSelector path="/heartbeats_viewer" current={period}
        kibanaUrl={dashboardUrl(HEARTBEATS_DASHBOARD, period, false)} />
      <iframe key={period} className="dashboard" title="Heartbeats" src={dashboardUrl(HEARTBEATS_DASHBOARD, period, true)} />
    </div>
  );
}
