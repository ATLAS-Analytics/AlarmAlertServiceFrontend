'use client';

import { useEffect, useRef } from 'react';
import type { AlarmCategory, Topology } from '@/lib/types';

interface Props {
  categories: AlarmCategory[];
  isSelected: (t: Topology) => boolean;
  onToggle: (events: Topology[], select: boolean) => void;
}

function TriCheckbox({ events, isSelected, onToggle, label, title }: {
  events: Topology[];
  label: string;
  title?: string;
} & Pick<Props, 'isSelected' | 'onToggle'>) {
  const ref = useRef<HTMLInputElement>(null);
  const selected = events.filter(isSelected).length;
  const all = selected === events.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && !all;
  }, [selected, all]);
  return (
    <label title={title}>
      <input ref={ref} type="checkbox" checked={all} onChange={() => onToggle(events, !all)} />
      {label}
    </label>
  );
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  });
  return groups;
}

/** Collapsible category → subcategory → event tree with tri-state checkboxes. */
export default function TopologyTree({ categories, isSelected, onToggle }: Props) {
  if (categories.length === 0) return <p className="text-muted">None registered.</p>;
  const sorted = [...categories].sort((a, b) => `${a.category}/${a.subcategory}/${a.event}`
    .localeCompare(`${b.category}/${b.subcategory}/${b.event}`));
  return (
    <div className="topology-tree mb-4">
      <ul>
        {[...groupBy(sorted, (c) => c.category)].map(([category, inCategory]) => (
          <li key={category}>
            <details>
              <summary>
                <TriCheckbox label={category} events={inCategory} isSelected={isSelected} onToggle={onToggle} />
              </summary>
              <ul>
                {[...groupBy(inCategory, (c) => c.subcategory)].map(([subcategory, inSub]) => (
                  <li key={subcategory}>
                    <details>
                      <summary>
                        <TriCheckbox label={subcategory} events={inSub} isSelected={isSelected} onToggle={onToggle} />
                      </summary>
                      <ul>
                        {inSub.map((c) => (
                          <li key={c.event}>
                            <TriCheckbox label={c.event} title={c.description} events={[c]}
                              isSelected={isSelected} onToggle={onToggle} />
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
