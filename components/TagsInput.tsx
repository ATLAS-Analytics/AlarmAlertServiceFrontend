'use client';

import { useId, useState } from 'react';
import type { Topology } from '@/lib/types';

// Suggestions per topology, shared by all inputs on the page.
const cache = new Map<string, Promise<string[]>>();

function loadTags({ category, subcategory, event }: Topology): Promise<string[]> {
  const qs = new URLSearchParams({ category, subcategory, event }).toString();
  if (!cache.has(qs)) {
    cache.set(qs, fetch(`/alarm/tags?${qs}`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
  }
  return cache.get(qs)!;
}

/** Comma separated tags input that suggests tags (site names) seen in recent alarms. */
export default function TagsInput({ topology, value, onChange }: {
  topology: Topology;
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [known, setKnown] = useState<string[]>();

  // A datalist completes the whole value, so offer "<tags typed so far>,<suggestion>".
  const parts = value.split(',').map((s) => s.trim());
  const prefix = parts.slice(0, -1).filter(Boolean).join(',');
  const options = (known ?? [])
    .filter((t) => !parts.slice(0, -1).includes(t))
    .map((t) => (prefix ? `${prefix},${t}` : t));

  return (
    <>
      <input aria-label="Tags" list={listId} value={value}
        onFocus={() => { if (!known) void loadTags(topology).then(setKnown); }}
        onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}
