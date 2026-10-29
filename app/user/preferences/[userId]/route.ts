import { getConfig } from '@/lib/config';
import { es, esStatus, INDICES } from '@/lib/es';
import { readBody, text } from '@/lib/http';

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { userId } = await params;
  const b = await readBody(req);
  if (b instanceof Response) return b;

  const allowed = getConfig().PREFERENCES;
  const disallowed = Object.keys(b).filter((key) => !(key in allowed));
  if (disallowed.length > 0) {
    return text(disallowed.map((key) => `${key} not allowed.\n`).join(''), 400);
  }

  try {
    await es().update({ index: INDICES.users, id: userId, refresh: true, doc: { preferences: b } });
    return text('OK');
  } catch (err) {
    if (esStatus(err) === 404) return text('No user with that ID.', 404);
    console.error('cant update user preferences:\n', err);
    return text('Error in updating preferences.', 500);
  }
}
