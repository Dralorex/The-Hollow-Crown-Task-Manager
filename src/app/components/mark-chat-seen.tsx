"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearChatPresenceAction,
  markChatNotificationsReadAction,
  pulseChatPresenceAction,
} from "@/app/actions/social";

/**
 * While this exact thread is open: heartbeat presence + clear unread.
 * On leave: clear presence so list/hub tabs still get notifications.
 */
export function MarkChatSeen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    if (ranFor.current !== groupId) {
      ranFor.current = groupId;
      void markChatNotificationsReadAction(groupId).then(() => router.refresh());
    }
    void pulseChatPresenceAction(groupId);
    const id = window.setInterval(() => {
      void pulseChatPresenceAction(groupId);
    }, 15_000);
    return () => {
      window.clearInterval(id);
      void clearChatPresenceAction(groupId);
    };
  }, [groupId, router]);

  return null;
}
