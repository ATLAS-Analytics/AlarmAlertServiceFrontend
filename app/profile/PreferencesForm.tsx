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
      <ul className="rows">
        {Object.entries(definitions).map(([key, def]) => (
          <li key={key}>
            <label htmlFor={`pref-${key}`}>{def.name}</label>
            {def.type === 'boolean' && (
              <input id={`pref-${key}`} type="checkbox"
                checked={Boolean(prefs[key])} onChange={(e) => set(key, e.target.checked)} />
            )}
            {def.type === 'number' && (
              <input id={`pref-${key}`} type="number"
                value={Number(prefs[key] ?? 0)} onChange={(e) => set(key, Number(e.target.value))} />
            )}
            {def.type === 'email' && (
              <input id={`pref-${key}`} type="email"
                value={String(prefs[key] ?? '')} onChange={(e) => set(key, e.target.value)} />
            )}
          </li>
        ))}
      </ul>
      <button type="submit" className="btn primary" disabled={saving}>Save preferences</button>
      {status && (
        <div className={status.ok ? 'notice' : 'notice error'} role="status">{status.message}</div>
      )}
    </form>
  );
}
