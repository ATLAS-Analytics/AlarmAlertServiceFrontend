'use client';

import { useState } from 'react';
import TopologyTree from '@/components/TopologyTree';
import { sameTopology, type AlarmCategory, type Subscription, type Topology } from '@/lib/types';

interface Props {
  userId: string;
  alarmCategories: AlarmCategory[];
  heartbeatCategories: AlarmCategory[];
  initial: Subscription[];
}

function tagsToString(tags: Subscription['tags']): string {
  if (tags === undefined) return '*';
  return Array.isArray(tags) ? tags.join(',') : tags;
}

export default function SubscriptionsEditor({ userId, alarmCategories, heartbeatCategories, initial }: Props) {
  const [subs, setSubs] = useState<Subscription[]>(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string }>();
  const [saving, setSaving] = useState(false);

  const isSelected = (t: Topology) => subs.some((s) => sameTopology(s, t));

  function toggle(events: Topology[], select: boolean) {
    setStatus(undefined);
    setSubs((current) => {
      if (!select) return current.filter((s) => !events.some((e) => sameTopology(s, e)));
      const added = events
        .filter((e) => !current.some((s) => sameTopology(s, e)))
        .map(({ category, subcategory, event }) => ({ category, subcategory, event, tags: '*' }));
      return [...current, ...added];
    });
  }

  function setTags(index: number, tags: string) {
    setStatus(undefined);
    setSubs((current) => current.map((s, i) => (i === index ? { ...s, tags } : s)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/user/subscriptions/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subs),
      });
      setStatus(res.ok ? { ok: true, message: 'Subscriptions updated.' } : { ok: false, message: await res.text() });
    } catch (err) {
      setStatus({ ok: false, message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="row">
      <div className="col-lg-5">
        <h2>Alarms</h2>
        <TopologyTree categories={alarmCategories} isSelected={isSelected} onToggle={toggle} />
        <h2>Heartbeats</h2>
        <TopologyTree categories={heartbeatCategories} isSelected={isSelected} onToggle={toggle} />
      </div>
      <div className="col-lg-7">
        <h2>Current Subscriptions</h2>
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th>Category</th>
              <th>Subcategory</th>
              <th>Event</th>
              <th title="Comma separated list of tags, or * for all.">Tags</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 && (
              <tr><td colSpan={5} className="text-muted">No subscriptions. Select events on the left.</td></tr>
            )}
            {subs.map((s, i) => (
              <tr key={`${s.category}\u0000${s.subcategory}\u0000${s.event}`}>
                <td>{s.category}</td>
                <td>{s.subcategory}</td>
                <td>{s.event}</td>
                <td>
                  <input className="form-control form-control-sm" aria-label="Tags"
                    value={tagsToString(s.tags)} onChange={(e) => setTags(i, e.target.value)} />
                </td>
                <td>
                  <button type="button" className="btn btn-sm btn-outline-danger" title="Unsubscribe"
                    onClick={() => toggle([s], false)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>Update Subscriptions</button>
        {status && (
          <div className={`alert mt-3 ${status.ok ? 'alert-success' : 'alert-danger'}`} role="status">{status.message}</div>
        )}
      </div>
    </div>
  );
}
