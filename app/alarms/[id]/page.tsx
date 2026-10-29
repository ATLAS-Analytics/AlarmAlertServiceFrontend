import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/session';
import { alarmTags, getAlarm, loadAlarmTopology } from '@/lib/alarms';
import { discoverUrl } from '@/lib/kibana';
import { sameTopology } from '@/lib/types';
import AnnotationForm from './AnnotationForm';

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// Linkable view of a single alarm, e.g. from alert emails: /alarms/<elasticsearch _id>
export default async function AlarmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [alarm, categories, user] = await Promise.all([getAlarm(id), loadAlarmTopology(), getUser()]);
  if (!alarm) notFound();
  const description = categories.find((c) => sameTopology(c, alarm))?.description;
  const { category, subcategory, event } = alarm;
  const tags = alarmTags(alarm);

  return (
    <div className="page">
      <p className="small"><Link href="/viewer">← All alarms</Link></p>
      <h1>{category} / {subcategory} / {event}</h1>
      {description && <p className="muted">{description}</p>}
      <dl className="meta">
        <dt>Created (UTC)</dt>
        <dd>{fmt(alarm.created_at)}</dd>
        {alarm.body && (<><dt>Body</dt><dd className="pre-wrap">{alarm.body}</dd></>)}
        {tags.length > 0 && (<><dt>Tags</dt><dd>{tags.join(', ')}</dd></>)}
      </dl>
      {alarm.source && Object.keys(alarm.source).length > 0 && (
        <>
          <h2>Source</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {Object.entries(alarm.source).map(([k, v]) => (
                  <tr key={k}><th>{k}</th><td>{typeof v === 'string' ? v : JSON.stringify(v)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p>
        <a className="btn" target="_blank" rel="noreferrer"
          href={discoverUrl({ category, subcategory, event }, alarm.created_at)}>
          Similar alarms in Kibana ↗
        </a>
      </p>

      <h2>Annotations</h2>
      {(alarm.annotations ?? []).length === 0 && <p className="muted">No annotations yet.</p>}
      {(alarm.annotations ?? []).length > 0 && (
        <ul className="notes">
          {(alarm.annotations ?? []).map((a) => (
            <li key={`${a.created_at}-${a.user}`}>
              <div className="small muted">{a.user} · {fmt(a.created_at)}</div>
              <div className="pre-wrap">{a.text}</div>
            </li>
          ))}
        </ul>
      )}
      {user
        ? <AnnotationForm alarmId={id} />
        : <p className="muted"><a href="/login">Log in</a> to add annotations.</p>}
    </div>
  );
}
