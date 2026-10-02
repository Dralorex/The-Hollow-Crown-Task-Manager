"use client";

import { useEffect, useState } from "react";
import { fetchChatPresence } from "@/app/actions/social";
import {
  typingLabel,
  type ChatPresenceMember,
} from "@/lib/chat-presence";

type PresenceListener = (presence: ChatPresenceMember[]) => void;

type SharedPresence = {
  listeners: Set<PresenceListener>;
  presence: ChatPresenceMember[];
  cleanup: (() => void) | null;
  refCount: number;
};

/** One EventSource (or poller) per group across Strip + TypingLine. */
const shared = new Map<string, SharedPresence>();

const PRESENCE_POLL_MS = 8_000;

function ensurePresence(groupId: string): SharedPresence {
  let entry = shared.get(groupId);
  if (entry) return entry;

  entry = {
    listeners: new Set(),
    presence: [],
    cleanup: null,
    refCount: 0,
  };
  shared.set(groupId, entry);

  let cancelled = false;
  let pollId: number | undefined;
  let source: EventSource | null = null;

  async function pollOnce() {
    const result = await fetchChatPresence(groupId);
    if (cancelled || !result.ok) return;
    entry!.presence = result.presence;
    for (const listener of entry!.listeners) listener(result.presence);
  }

  function startPolling() {
    void pollOnce();
    pollId = window.setInterval(() => {
      void pollOnce();
    }, PRESENCE_POLL_MS);
  }

  try {
    source = new EventSource(`/api/chat/${groupId}/presence`);
    source.addEventListener("presence", (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(
          (event as MessageEvent).data,
        ) as ChatPresenceMember[];
        if (Array.isArray(data)) {
          entry!.presence = data;
          for (const listener of entry!.listeners) listener(data);
        }
      } catch {
        // ignore bad payloads
      }
    });
    source.onerror = () => {
      source?.close();
      source = null;
      if (!cancelled && pollId === undefined) startPolling();
    };
  } catch {
    startPolling();
  }

  entry.cleanup = () => {
    cancelled = true;
    source?.close();
    if (pollId !== undefined) window.clearInterval(pollId);
  };

  return entry;
}

function useChatPresence(
  groupId: string,
  memberUsernames: { userId: string; username: string }[],
) {
  const [presence, setPresence] = useState<ChatPresenceMember[]>(() =>
    memberUsernames.map((m) => ({
      ...m,
      online: false,
      typing: false,
    })),
  );

  useEffect(() => {
    const entry = ensurePresence(groupId);
    entry.refCount += 1;

    const listener: PresenceListener = (next) => setPresence(next);
    entry.listeners.add(listener);
    if (entry.presence.length) setPresence(entry.presence);

    return () => {
      entry.listeners.delete(listener);
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        entry.cleanup?.();
        shared.delete(groupId);
      }
    };
  }, [groupId]);

  return presence.filter((p) =>
    memberUsernames.some((m) => m.userId === p.userId),
  );
}

/** Online dots under the chat title */
export function ChatPresenceStrip({
  groupId,
  memberUsernames,
}: {
  groupId: string;
  memberUsernames: { userId: string; username: string }[];
}) {
  const presence = useChatPresence(groupId, memberUsernames);
  const online = presence.filter((p) => p.online);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#0A3D45]/55">
      {presence.map((m) => (
        <span key={m.userId} className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              m.online ? "bg-[#3DBEAB]" : "bg-[#0A3D45]/25"
            }`}
            aria-hidden
          />
          @{m.username}
        </span>
      ))}
      {online.length > 0 ? (
        <span className="text-[#0A3D45]/40">· {online.length} online</span>
      ) : null}
    </div>
  );
}

/** “X is typing…” line — place directly above the message box */
export function ChatTypingLine({
  groupId,
  memberUsernames,
}: {
  groupId: string;
  memberUsernames: { userId: string; username: string }[];
}) {
  const presence = useChatPresence(groupId, memberUsernames);
  const typing = presence.filter((p) => p.typing).map((p) => p.username);
  const label = typingLabel(typing);

  return (
    <p
      className={`min-h-4 text-left text-xs font-medium italic ${
        label ? "text-[#1a7a82]" : "text-transparent"
      }`}
      aria-live="polite"
    >
      {label ?? "."}
    </p>
  );
}
