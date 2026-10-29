import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { loadUser } from '@/lib/users';
import PreferencesForm from './PreferencesForm';

export default async function Profile() {
  const { id } = await requireUser();
  const user = await loadUser(id);
  if (!user) {
    return <div className="container"><p className="alert alert-danger">Could not load your profile.</p></div>;
  }
  return (
    <div className="container">
      <div className="row">
        <div className="col-lg-5 mx-auto">
          <h1>Profile</h1>
          <dl>
            <dt>Name:</dt>
            <dd>{user.user}</dd>
            <dt>Email:</dt>
            <dd>{user.email}</dd>
            <dt>Organization:</dt>
            <dd>{user.affiliation}</dd>
          </dl>
          <a className="btn btn-primary" href="/logout">Logout</a>
        </div>
        <div className="col-lg-6 mx-auto">
          <h1>Preferences</h1>
          <PreferencesForm userId={id} definitions={getConfig().PREFERENCES} initial={user.preferences} />
        </div>
      </div>
    </div>
  );
}
