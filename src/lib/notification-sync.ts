import { unstable_cache } from "next/cache";
import { syncBirthdayNotifications } from "@/lib/birthday";
import { syncDeadlineNotifications } from "@/lib/deadline-notifications";

/** At most once per user in this window (layout navigations share the cache). */
const SYNC_REVALIDATE_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Run deadline + birthday notification sync, throttled per user so every
 * `/app` layout render does not re-query/create notifications.
 */
export async function syncUserNotificationsThrottled(userId: string) {
  if (!userId) return;
  await unstable_cache(
    async () => {
      await syncDeadlineNotifications(userId);
      await syncBirthdayNotifications(userId);
      return true as const;
    },
    ["user-notification-sync", userId],
    { revalidate: SYNC_REVALIDATE_SECONDS },
  )();
}
