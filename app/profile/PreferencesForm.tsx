'use client';

import { useState } from 'react';
import type { Preference } from '@/lib/config';
import type { UserDoc } from '@/lib/types';

type Prefs = UserDoc['preferences'];

interface Props {
  userId: string;
  definitions: Record<string, Preference>;
  initial: Prefs;
}

export default function PreferencesForm({ userId, definitions, initial }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string }>();
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: Prefs[string]) => setPrefs((p) => ({ ...p, [key]: value }));

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setSaving(true);
    try {
      const res = await fetch(`/user/preferences/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      setStatus(res.ok ? { ok: true, message: 'Preferences updated.' } : { ok: false, message: await res.text() });
    } catch (err) {
      setStatus({ ok: false, message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <ul className="list-group list-group-flush mb-3">
        {Object.entries(definitions).map(([key, def]) => (
          <li key={key} className="list-group-item d-flex align-items-center gap-3">
            <label htmlFor={`pref-${key}`} className="flex-grow-1">{def.name}</label>
            {def.type === 'boolean' && (
              <input id={`pref-${key}`} className="form-check-input" type="checkbox"
                checked={Boolean(prefs[key])} onChange={(e) => set(key, e.target.checked)} />
            )}
            {def.type === 'number' && (
              <input id={`pref-${key}`} className="form-control w-auto" type="number"
                value={Number(prefs[key] ?? 0)} onChange={(e) => set(key, Number(e.target.value))} />
            )}
            {def.type === 'email' && (
              <input id={`pref-${key}`} className="form-control w-auto" type="email"
                value={String(prefs[key] ?? '')} onChange={(e) => set(key, e.target.value)} />
            )}
          </li>
        ))}
      </ul>
      <button type="submit" className="btn btn-primary" disabled={saving}>Update Preferences</button>
      {status && (
        <div className={`alert mt-3 ${status.ok ? 'alert-success' : 'alert-danger'}`} role="status">{status.message}</div>
      )}
    </form>
  );
}
