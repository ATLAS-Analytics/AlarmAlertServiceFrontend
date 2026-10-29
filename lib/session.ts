import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import { getConfig, getGlobusConfig } from './config';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  affiliation: string;
}

export interface SessionData {
  user?: SessionUser;
  token?: string;
  oauthState?: string;
}

let options: SessionOptions | undefined;

function sessionOptions(): SessionOptions {
  if (!options) {
    const globus = getGlobusConfig();
    // Must be stable across restarts/replicas and >= 32 chars. Falls back to a value
    // derived from the Globus client secret so no new k8s secret is required.
    const password = process.env.SESSION_SECRET
      ?? getConfig().SESSION_SECRET
      ?? crypto.createHash('sha256').update(`aaasf-session:${globus.CLIENT_SECRET}`).digest('hex');
    options = {
      password,
      cookieName: 'aaasf_session',
      ttl: 3600,
      cookieOptions: { secure: globus.REDIRECT_LINK.startsWith('https:'), sameSite: 'lax' },
    };
  }
  return options;
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function getUser(): Promise<SessionUser | undefined> {
  return (await getSession()).user;
}
