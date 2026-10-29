'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AnnotationForm({ alarmId }: { alarmId: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const res = await fetch(`/alarms/${encodeURIComponent(alarmId)}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setValue('');
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <textarea rows={3} aria-label="New annotation" placeholder="Add an annotation…"
        value={value} onChange={(e) => setValue(e.target.value)} maxLength={5000} required />
      <button type="submit" className="btn primary" disabled={saving || !value.trim()}>Add annotation</button>
      {error && <div className="notice error" role="status">{error}</div>}
    </form>
  );
}
