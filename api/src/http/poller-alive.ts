
// Whether the poller that wrote status.json is still running. The studio runs next to it (same
// machine or same container), so its pid means something here, unlike from outside a container.
export function pollerAlive(status: any) {
  try {
    return Boolean(status?.pid) && status.phase !== 'stopped' && process.kill(status.pid, 0);
  } catch {
    return false;
  }
}
