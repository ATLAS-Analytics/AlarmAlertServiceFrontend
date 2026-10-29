import { requireUser } from '@/lib/auth';

const DASHBOARD = 'https://atlas-kibana.mwt2.org:5601/s/aaas/app/dashboards?auth_provider_hint=anonymous1#/view/cf438520-2afb-11ed-afcf-d91dad577662?embed=true&_g=(filters%3A!()%2CrefreshInterval%3A(pause%3A!t%2Cvalue%3A0)%2Ctime%3A(from%3Anow-7d%2Cto%3Anow))&show-time-filter=true&hide-filter-bar=true';

export default async function HeartbeatsViewer() {
  await requireUser();
  return (
    <div className="container-fluid">
      <iframe className="dashboard" title="Heartbeats" src={DASHBOARD} />
    </div>
  );
}
