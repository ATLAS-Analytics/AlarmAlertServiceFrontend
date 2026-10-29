import Link from 'next/link';
import { PERIODS, type Period } from '@/lib/kibana';

export default function PeriodSelector({ path, current, kibanaUrl }: { path: string; current: Period; kibanaUrl: string }) {
  return (
    <div className="toolbar">
      <span className="muted small">Last</span>
      <div className="segmented" role="group" aria-label="Time range">
        {PERIODS.map((p) => (
          <Link key={p} href={`${path}?period=${p}`} aria-current={p === current ? 'true' : undefined}>
            {p}
          </Link>
        ))}
      </div>
      <a className="btn end" href={kibanaUrl} target="_blank" rel="noreferrer">
        Kibana ↗
      </a>
    </div>
  );
}
