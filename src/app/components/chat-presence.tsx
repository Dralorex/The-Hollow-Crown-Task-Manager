"use client";

import { useEffect, useState } from "react";
import * as Ably from "ably";
import {
  useAblyClient,
  useRealtimeEnabled,
  useRealtimeUserId,
} from "@/app/components/realtime-provider";
import { chatPresenceChannelName } from "@/lib/ably-channels";
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
  /** Live Ably channel for snappy typing updates from the composer. */
  channel: Ably.RealtimeChannel | null;
  selfUsername: string;
};

/** One Ably presence subscription (or JSON poller) per group across Strip + TypingLine. */
const shared = new Map<string, SharedPresence>();

/** No-Ably / fallback poll — never SSE. Keep slow to avoid Neon chatter. */
const PRESENCE_POLL_MS = 20_000;

type PresenceData = { username?: string; typing?: boolean };

function mapAblyPresence(
  members: Ably.PresenceMessage[],
  memberUsernames: { userId: string; username: string }[],
  selfId: string,
): ChatPresenceMember[] {
  const byId = new Map(members.map((m) => [m.clientId, m]));
  return memberUsernames.map((m) => {
    const hit = byId.get(m.userId);
    const data = (hit?.data ?? {}) as PresenceData;
    return {
      userId: m.userId,
      username: m.username,
      online: Boolean(hit),
      typing: Boolean(hit && m.userId !== selfId && data.typing),
    };
  });
}

async function fetchPresenceJson(
  groupId: string,
): Promise<ChatPresenceMember[] | null> {
  try {
    const res = await fetch(`/api/chat/${groupId}/presence`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { presence?: ChatPresenceMember[] };
    return Array.isArray(data.presence) ? data.presence : null;
  } catch {
    return null;
  }
}

function ensurePresence(
  groupId: string,
  opts: {
    client: Ably.Realtime | null;
    ablyEnabled: boolean;
    selfId: string;
    selfUsername: string;
    memberUsernames: { userId: string; username: string }[];
  },
): SharedPresence {
  const wantAbly = Boolean(opts.ablyEnabled && opts.client && opts.selfId);
  let entry = shared.get(groupId);
  if (entry) {
    entry.selfUsername = opts.selfUsername || entry.selfUsername;
    return entry;
  }

  entry = {
    listeners: new Set(),
    presence: opts.memberUsernames.map((m) => ({
      ...m,
      online: false,
      typing: false,
    })),
    cleanup: null,
    refCount: 0,
    channel: null,
    selfUsername: opts.selfUsername,
  };
  shared.set(groupId, entry);

  let cancelled = false;
  let pollId: number | undefined;

  const notify = (next: ChatPresenceMember[]) => {
    entry!.presence = next;
    for (const listener of entry!.listeners) listener(next);
  };

  const refreshFromChannel = async (channel: Ably.RealtimeChannel) => {
    try {
      const members = await channel.presence.get();
      if (cancelled) return;
      notify(mapAblyPresence(members ?? [], opts.memberUsernames, opts.selfId));
    } catch {
      // ignore transient attach errors
    }
  };

  function startPolling() {
    const pollOnce = async () => {
      const next = await fetchPresenceJson(groupId);
      if (cancelled || !next) return;
      notify(next);
    };
    void pollOnce();
    pollId = window.setInterval(() => {
      void pollOnce();
    }, PRESENCE_POLL_MS);
  }

  if (wantAbly && opts.client) {
    const client = opts.client;
    const channel = client.channels.get(chatPresenceChannelName(groupId));
    entry.channel = channel;

    const onPresence = () => {
      void refreshFromChannel(channel);
    };

    const enterSelf = async () => {
      const data = { username: opts.selfUsername, typing: false };
      try {
        await channel.presence.enter(data);
        return;
      } catch {
        /* token may predate this membership — re-auth with groupId then retry */
      }
      if (cancelled) return;
      try {
        await client.auth.authorize(undefined, {
          authUrl: `/api/ably/auth?groupId=${encodeURIComponent(groupId)}`,
          authMethod: "GET",
        });
        await channel.presence.enter(data);
      } catch {
        /* enter may race with teardown / capability */
      }
    };

    const ignoreTeardown = () => {};
    void channel.presence
      .subscribe(onPresence)
      .then(async () => {
        if (cancelled) return;
        await enterSelf();
        await refreshFromChannel(channel);
      })
      .catch(ignoreTeardown);

    entry.cleanup = () => {
      cancelled = true;
      try {
        channel.presence.unsubscribe(onPresence);
      } catch {
        /* ignore */
      }
      void channel.presence.leave().catch(() => {});
      entry!.channel = null;
    };
  } else {
    startPolling();
    entry.cleanup = () => {
      cancelled = true;
      if (pollId !== undefined) window.clearInterval(pollId);
    };
  }

  return entry;
}

/**
 * Update typing flag on the shared Ably presence member (instant local fan-out).
 * Neon typingAt is still written by setTypingAction for JSON/no-Ably fallback.
 */
export function setLocalChatTyping(groupId: string, typing: boolean) {
  const entry = shared.get(groupId);
  if (!entry?.channel) return;
  const data = { username: entry.selfUsername, typing };
  void entry.channel.presence.update(data).catch(() => {
    void entry.channel?.presence.enter(data).catch(() => {});
  });
}

export function useChatPresence(
  groupId: string,
  memberUsernames: { userId: string; username: string }[],
) {
  const client = useAblyClient();
  const ablyEnabled = useRealtimeEnabled();
  const selfId = useRealtimeUserId();
  const selfUsername =
    memberUsernames.find((m) => m.userId === selfId)?.username ?? "";

  const [presence, setPresence] = useState<ChatPresenceMember[]>(() =>
    memberUsernames.map((m) => ({
      ...m,
      online: false,
      typing: false,
    })),
  );

  useEffect(() => {
    const entry = ensurePresence(groupId, {
      client,
      ablyEnabled,
      selfId,
      selfUsername,
      memberUsernames,
    });
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
    // Remount when Ably client appears/disappears so we switch poll ↔ presence.
  }, [groupId, client, ablyEnabled, selfId, selfUsername]);

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
