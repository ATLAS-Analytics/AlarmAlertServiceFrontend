// Shared between server and client code.

export interface Topology {
  category: string;
  subcategory: string;
  event: string;
}

export interface AlarmCategory extends Topology {
  description?: string;
  template?: string;
  [key: string]: unknown;
}

export interface HeartbeatCategory extends AlarmCategory {
  interval: number;
  min_expected: number;
}

export interface Subscription extends Topology {
  tags?: string | string[];
}

export interface UserDoc {
  username?: string;
  affiliation?: string;
  user?: string;
  email?: string;
  preferences: Record<string, boolean | number | string>;
  subscriptions: Subscription[];
  created_at?: number;
}

export function sameTopology(a: Topology, b: Topology): boolean {
  return a.category === b.category && a.subcategory === b.subcategory && a.event === b.event;
}
