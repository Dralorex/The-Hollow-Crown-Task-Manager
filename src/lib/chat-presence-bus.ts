type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeChatPresence(
  groupId: string,
  listener: Listener,
): () => void {
  let set = listeners.get(groupId);
  if (!set) {
    set = new Set();
    listeners.set(groupId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(groupId);
  };
}

/** Notify SSE subscribers to reload presence for this chat. */
export function publishChatPresence(groupId: string) {
  const set = listeners.get(groupId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}
