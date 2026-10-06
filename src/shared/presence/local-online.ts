/** In-process socket online set — works when Redis is off (single socket node). */

const onlineSockets = new Map<string, Set<string>>();

export function isLocallyOnline(userUuid: string): boolean {
  const set = onlineSockets.get(userUuid);
  return Boolean(set && set.size > 0);
}

export function localOnlineIds(): Set<string> {
  return new Set(onlineSockets.keys());
}

/** Returns true if this socket made the user newly online. */
export function markLocallyOnline(userUuid: string, socketId: string): boolean {
  if (!userUuid || !socketId) return false;
  let set = onlineSockets.get(userUuid);
  if (!set) {
    set = new Set();
    onlineSockets.set(userUuid, set);
  }
  const wasOffline = set.size === 0;
  set.add(socketId);
  return wasOffline;
}

/** Returns true if the user fully went offline (no sockets left). */
export function markLocallyOffline(userUuid: string, socketId: string): boolean {
  const set = onlineSockets.get(userUuid);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineSockets.delete(userUuid);
    return true;
  }
  return false;
}
