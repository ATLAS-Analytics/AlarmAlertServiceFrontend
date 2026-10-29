import 'server-only';
import { redirect } from 'next/navigation';
import { getUser, type SessionUser } from './session';

/** For pages that need a logged-in user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/');
  return user;
}
