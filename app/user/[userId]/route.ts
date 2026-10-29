import { es, INDICES } from '@/lib/es';
import { text } from '@/lib/http';
import { loadUser } from '@/lib/users';

type Ctx = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { userId } = await params;
  try {
    return Response.json(await loadUser(userId));
  } catch (err) {
    console.error(err);
    return text('Error in loading user.', 500);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { userId } = await params;
  console.log('Deleting user with id:', userId);
  try {
    const response = await es().deleteByQuery({
      index: INDICES.users,
      refresh: true,
      query: { ids: { values: [userId] } },
    });
    if (response.deleted === 1) return text('OK');
    return text('No user with that ID.', 404);
  } catch (err) {
    console.error(err);
    return text('Error in deleting user.', 500);
  }
}
