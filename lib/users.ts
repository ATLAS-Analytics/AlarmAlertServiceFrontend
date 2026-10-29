import 'server-only';
import { es, INDICES } from './es';
import { getConfig } from './config';
import type { SessionUser } from './session';
import type { UserDoc } from './types';

function defaultPreferences(): UserDoc['preferences'] {
  return Object.fromEntries(Object.entries(getConfig().PREFERENCES).map(([k, p]) => [k, p.default_value]));
}

/** Returns the user's document with any missing preferences filled with defaults. */
export async function loadUser(userId: string): Promise<UserDoc | false> {
  const response = await es().search<UserDoc>({
    index: INDICES.users,
    size: 1,
    query: { ids: { values: [userId] } },
  });
  const doc = response.hits.hits[0]?._source;
  if (!doc) return false;
  return {
    ...doc,
    preferences: { ...defaultPreferences(), ...doc.preferences },
    subscriptions: doc.subscriptions ?? [],
  };
}

export async function loadAllUsers() {
  const response = await es().search<UserDoc>({
    index: INDICES.users,
    size: 1000,
    query: { match_all: {} },
  });
  return response.hits.hits;
}

export async function addIfNeeded(u: SessionUser): Promise<void> {
  if (await loadUser(u.id)) return;
  const response = await es().index({
    index: INDICES.users,
    id: u.id,
    refresh: true,
    document: {
      username: u.username,
      affiliation: u.affiliation,
      user: u.name,
      email: u.email,
      preferences: defaultPreferences(),
      subscriptions: [],
      created_at: Date.now(),
    } satisfies UserDoc,
  });
  console.log(response.result === 'created' ? 'New user indexed.' : 'New user NOT indexed.');
}
