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

export function useLiveBadges(fallback: BadgeState): BadgeState {
  return useContext(BadgeContext) ?? fallback;
}

/** True when Ably is configured (push path; soft-poll can stay off). */
export function useRealtimeEnabled() {
  return useContext(RealtimeEnabledContext);
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

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setBadges({
      unreadCount: initialUnreadCount,
      chatUnreadCount: initialChatUnreadCount,
    });
  }, [initialUnreadCount, initialChatUnreadCount]);

  useEffect(() => {
    if (!enabled || !userId || !pollingActive) return;

    const client = new Ably.Realtime({
      authUrl: "/api/ably/auth",
      authMethod: "GET",
      clientId: userId,
      autoConnect: true,
    });

    const channel = client.channels.get(userChannelName(userId));

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

    void channel.subscribe("badges", onBadges);
    void channel.subscribe("badge-delta", onBadgeDelta);
    void channel.subscribe(CHAT_MESSAGE_ABLY, onChatMessage);
    void channel.subscribe("refresh", onRefresh);

    return () => {
      channel.unsubscribe("badges", onBadges);
      channel.unsubscribe("badge-delta", onBadgeDelta);
      channel.unsubscribe(CHAT_MESSAGE_ABLY, onChatMessage);
      channel.unsubscribe("refresh", onRefresh);
      // Ably close() may reject when the connection is already closed
      // (React Strict Mode remount / idle teardown). Never surface that.
      try {
        const closing = client.close() as void | Promise<unknown>;
        if (closing != null && typeof (closing as Promise<unknown>).catch === "function") {
          void (closing as Promise<unknown>).catch(() => {});
        }
      } catch {
        /* ignore sync close failures */
      }
    };
    // pathname is read via ref so nav does not tear down the Ably connection.
  }, [enabled, userId, pollingActive, router]);

  const value = useMemo(() => badges, [badges]);

  return (
    <RealtimeEnabledContext.Provider value={enabled}>
      <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
    </RealtimeEnabledContext.Provider>
  );
}
