import { requireUser } from '@/lib/auth';
import { loadAlarmTopology } from '@/lib/alarms';
import { loadHeartbeatTopology } from '@/lib/heartbeats';
import { loadUser } from '@/lib/users';
import SubscriptionsEditor from './SubscriptionsEditor';

export default async function Subscriptions() {
  const { id } = await requireUser();
  const [user, alarmCategories, heartbeatCategories] = await Promise.all([
    loadUser(id), loadAlarmTopology(), loadHeartbeatTopology(),
  ]);
  if (!user) {
    return <div className="page"><p className="notice error">Could not load your profile.</p></div>;
  }
  return (
    <div className="page wide">
      <h1>Subscriptions</h1>
      <SubscriptionsEditor
        userId={id}
        alarmCategories={alarmCategories}
        heartbeatCategories={heartbeatCategories}
        initial={user.subscriptions}
      />
    </div>
  );
}
