"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsReadAction } from "@/app/actions/notifications";

/** Clears unread count after the notifications page is viewed. */
export function MarkNotificationsSeen({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!hasUnread || ran.current) return;
    ran.current = true;
    void markAllNotificationsReadAction().then(() => router.refresh());
  }, [hasUnread, router]);

  return null;
}
