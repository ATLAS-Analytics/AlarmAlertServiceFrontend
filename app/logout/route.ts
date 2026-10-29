import { getGlobusConfig } from '@/lib/config';
import { redirectTo } from '@/lib/http';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (session.token) {
    const globus = getGlobusConfig();
    try {
      const res = await fetch(`${globus.LOGOUT_URI}?${new URLSearchParams({ client_id: globus.CLIENT_ID })}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      console.log(`logout status: ${res.status}`);
    } catch (err) {
      console.log('globus logout failure...', err);
    }
  }
  session.destroy();
  return redirectTo('/');
}
