export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  console.log('Alarm & Alert Service server starting ... ');
  const { loadHeartbeatTopology } = await import('./lib/heartbeats');
  await loadHeartbeatTopology();
}
