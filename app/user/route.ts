import { loadAllUsers } from '@/lib/users';
import { text } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await loadAllUsers());
  } catch (err) {
    console.error(err);
    return text('Error in loading users.', 500);
  }
}
