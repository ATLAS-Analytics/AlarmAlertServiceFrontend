import { es, esStatus, INDICES } from '@/lib/es';
import { text } from '@/lib/http';
import type { Subscription } from '@/lib/types';

type Ctx = { params: Promise<{ userId: string }> };

function isSubscription(s: unknown): s is Subscription {
  if (s === null || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return typeof o.category === 'string' && typeof o.subcategory === 'string' && typeof o.event === 'string';
}

// Replaces all of the user's subscriptions with the POSTed array.
export async function POST(req: Request, { params }: Ctx) {
  const { userId } = await params;
  let b: unknown;
  try {
    b = await req.json();
  } catch {
    return text('nothing POSTed.\n', 400);
  }
  if (!Array.isArray(b)) return text('expected a JSON array of subscriptions.\n', 400);
  if (!b.every(isSubscription)) return text('each subscription needs category, subcategory and event.\n', 400);

  const subscriptions = b.map(({ category, subcategory, event, tags }) => ({
    category, subcategory, event, tags: tags ?? '*',
  }));

  try {
    await es().update({ index: INDICES.users, id: userId, refresh: true, doc: { subscriptions } });
    return text('OK');
  } catch (err) {
    if (esStatus(err) === 404) return text('No user with that ID.', 404);
    console.error('cant update user subscriptions:\n', err);
    return text('Error in updating subscriptions.', 500);
  }
}
