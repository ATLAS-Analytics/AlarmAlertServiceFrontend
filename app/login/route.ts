import crypto from 'node:crypto';
import { getGlobusConfig } from '@/lib/config';
import { redirectTo } from '@/lib/http';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const globus = getGlobusConfig();
  const session = await getSession();
  session.oauthState = crypto.randomBytes(16).toString('hex');
  await session.save();

  const params = new URLSearchParams({
    scope: 'openid email profile urn:globus:auth:scope:auth.globus.org:view_identities',
    state: session.oauthState,
    response_type: 'code',
    redirect_uri: globus.REDIRECT_LINK,
    client_id: globus.CLIENT_ID,
  });
  return redirectTo(`${globus.AUTHORIZE_URI}?${params.toString()}`);
}
