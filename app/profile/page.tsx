import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { loadUser } from '@/lib/users';
import PreferencesForm from './PreferencesForm';

export default async function Profile() {
  const { id } = await requireUser();
  const user = await loadUser(id);
  if (!user) {
    return <div className="page"><p className="notice error">Could not load your profile.</p></div>;
  }
  return (
    <div className="page narrow">
      <h1>Profile</h1>
      <dl className="meta">
        <dt>Name</dt>
        <dd>{user.user}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Organization</dt>
        <dd>{user.affiliation}</dd>
      </dl>
      <a className="btn" href="/logout">Log out</a>

      <h2>Preferences</h2>
      <PreferencesForm userId={id} definitions={getConfig().PREFERENCES} initial={user.preferences} />
    </div>
  );
}
