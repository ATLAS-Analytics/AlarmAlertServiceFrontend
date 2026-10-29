import type { NextRequest } from 'next/server';
import { getGlobusConfig } from '@/lib/config';
import { redirectTo } from '@/lib/http';
import { getSession } from '@/lib/session';
import { addIfNeeded } from '@/lib/users';

const USERINFO_URI = 'https://auth.globus.org/v2/oauth2/userinfo';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const session = await getSession();
  const expectedState = session.oauthState;
  session.oauthState = undefined;

  if (!code || !expectedState || state !== expectedState) {
    console.log('AUTH CALLBACK without valid code/state.');
    await session.save();
    return redirectTo('/');
  }

  const globus = getGlobusConfig();
  try {
    const tokenRes = await fetch(globus.TOKEN_URI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${globus.CLIENT_ID}:${globus.CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: globus.REDIRECT_LINK }),
    });
    if (!tokenRes.ok) throw new Error(`token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const { access_token: token } = (await tokenRes.json()) as { access_token: string };

    const infoRes = await fetch(USERINFO_URI, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!infoRes.ok) throw new Error(`userinfo request failed: ${infoRes.status} ${await infoRes.text()}`);
    const info = (await infoRes.json()) as Record<string, string>;

    const user = {
      id: info.sub,
      name: info.name,
      email: info.email,
      username: info.preferred_username,
      affiliation: info.organization,
    };
    await addIfNeeded(user);
    session.user = user;
    session.token = token;
  } catch (err) {
    console.error('Globus login failed:', err);
  }
  await session.save();
  return redirectTo('/');
}
