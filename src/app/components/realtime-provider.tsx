"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Ably from "ably";
import { userChannelName } from "@/lib/ably-channels";
import {
  CHAT_MESSAGE_ABLY,
  CHAT_MESSAGE_EVENT,
  type ChatMessageEvent,
} from "@/lib/chat-message-events";
import { useActivePolling } from "@/lib/use-active-polling";

type BadgeState = {
  unreadCount: number;
  chatUnreadCount: number;
};

const BadgeContext = createContext<BadgeState | null>(null);
const RealtimeEnabledContext = createContext(false);
const AblyClientContext = createContext<Ably.Realtime | null>(null);
const RealtimeUserIdContext = createContext<string>("");

export function useLiveBadges(fallback: BadgeState): BadgeState {
  return useContext(BadgeContext) ?? fallback;
}

/** True when Ably is configured (push path; soft-poll can stay off). */
export function useRealtimeEnabled() {
  return useContext(RealtimeEnabledContext);
}

/** Shared Ably Realtime client (null when disconnected / disabled). */
export function useAblyClient() {
  return useContext(AblyClientContext);
}

export function useRealtimeUserId() {
  return useContext(RealtimeUserIdContext);
}

type RefreshPayload = { paths?: string[] };
type BadgesPayload = {
  unreadCount?: number;
  chatUnreadCount?: number;
};
type BadgeDeltaPayload = {
  unreadDelta?: number;
  chatUnreadDelta?: number;
};

/**
 * Connects to Ably while the tab is active; updates nav badges and
 * selectively refreshes RSC when the server publishes changes.
 * No connection when Ably is disabled or the tab is idle/hidden (via useActivePolling).
 */
export function RealtimeProvider({
  userId,
  enabled,
  initialUnreadCount,
  initialChatUnreadCount,
  children,
}: {
  userId: string;
  enabled: boolean;
  initialUnreadCount: number;
  initialChatUnreadCount: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const pollingActive = useActivePolling();
  const [badges, setBadges] = useState<BadgeState>({
    unreadCount: initialUnreadCount,
    chatUnreadCount: initialChatUnreadCount,
  });
  const [client, setClient] = useState<Ably.Realtime | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setBadges({
      unreadCount: initialUnreadCount,
      chatUnreadCount: initialChatUnreadCount,
    });
  }, [initialUnreadCount, initialChatUnreadCount]);

  // Stay connected on the chat page even if the tab blurs / goes "idle"
  // (two-window testing, reading while the other person types).
  const holdForOpenChat = pathname.startsWith("/app/chat");

  useEffect(() => {
    if (!enabled || !userId || (!pollingActive && !holdForOpenChat)) {
      setClient(null);
      return;
    }

    const realtime = new Ably.Realtime({
      authUrl: "/api/ably/auth",
      authMethod: "GET",
      clientId: userId,
      autoConnect: true,
    });
    setClient(realtime);

    const channel = realtime.channels.get(userChannelName(userId));

    const onBadges = (message: Ably.Message) => {
      const data = (message.data ?? {}) as BadgesPayload;
      setBadges((prev) => ({
        unreadCount:
          typeof data.unreadCount === "number"
            ? data.unreadCount
            : prev.unreadCount,
        chatUnreadCount:
          typeof data.chatUnreadCount === "number"
            ? data.chatUnreadCount
            : prev.chatUnreadCount,
      }));
    };

    const onBadgeDelta = (message: Ably.Message) => {
      const data = (message.data ?? {}) as BadgeDeltaPayload;
      setBadges((prev) => ({
        unreadCount: Math.max(
          0,
          prev.unreadCount +
            (typeof data.unreadDelta === "number" ? data.unreadDelta : 0),
        ),
        chatUnreadCount: Math.max(
          0,
          prev.chatUnreadCount +
            (typeof data.chatUnreadDelta === "number"
              ? data.chatUnreadDelta
              : 0),
        ),
      }));
    };

    const onChatMessage = (message: Ably.Message) => {
      const data = (message.data ?? {}) as ChatMessageEvent;
      if (!data?.id || !data.groupId) return;
      window.dispatchEvent(
        new CustomEvent(CHAT_MESSAGE_EVENT, { detail: data }),
      );
      // List preview / sidebar may still want a light refresh when on /app/chat
      // but not viewing this thread — dispatch list hint without full layout.
      window.dispatchEvent(new Event("rowgon:chat-refresh"));
    };

    const onRefresh = (message: Ably.Message) => {
      const path = pathnameRef.current;
      const data = (message.data ?? {}) as RefreshPayload;
      const paths = Array.isArray(data.paths) ? data.paths : [];
      if (paths.some((p) => p === "/app/chat" || p.startsWith("/app/chat"))) {
        window.dispatchEvent(new Event("rowgon:chat-refresh"));
        // Open chat thread patches via chat:message; skip full RSC refresh there.
        if (path.startsWith("/app/chat")) return;
      }
      if (paths.length === 0) {
        router.refresh();
        return;
      }
      const matches = paths.some(
        (p) =>
          path === p || path.startsWith(`${p}/`) || path.startsWith(p),
      );
      if (matches) router.refresh();
    };

    // Subscribe returns a Promise that rejects with "Connection closed" if we
    // tear down (Strict Mode remount / idle pause) before attach finishes.
    // `void` alone does not attach a rejection handler.
    const ignoreAblyTeardown = () => {};
    void channel.subscribe("badges", onBadges).catch(ignoreAblyTeardown);
    void channel.subscribe("badge-delta", onBadgeDelta).catch(ignoreAblyTeardown);
    void channel.subscribe(CHAT_MESSAGE_ABLY, onChatMessage).catch(ignoreAblyTeardown);
    void channel.subscribe("refresh", onRefresh).catch(ignoreAblyTeardown);

    return () => {
      setClient(null);
      try {
        channel.unsubscribe("badges", onBadges);
        channel.unsubscribe("badge-delta", onBadgeDelta);
        channel.unsubscribe(CHAT_MESSAGE_ABLY, onChatMessage);
        channel.unsubscribe("refresh", onRefresh);
      } catch {
        /* ignore */
      }
      try {
        // close() is sync/void; in-flight subscribe/auth promises reject when
        // the connection drops — those are handled via .catch above.
        realtime.close();
      } catch {
        /* ignore */
      }
    };
    // pathnameRef used for refresh matching; holdForOpenChat may reconnect when
    // entering/leaving /app/chat so live messages stay subscribed.
  }, [enabled, userId, pollingActive, holdForOpenChat, router]);

  const value = useMemo(() => badges, [badges]);

  return (
    <RealtimeEnabledContext.Provider value={enabled}>
      <RealtimeUserIdContext.Provider value={userId}>
        <AblyClientContext.Provider value={client}>
          <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
        </AblyClientContext.Provider>
      </RealtimeUserIdContext.Provider>
    </RealtimeEnabledContext.Provider>
  );
}
