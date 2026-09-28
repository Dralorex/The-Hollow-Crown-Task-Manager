import { redirect } from "next/navigation";
import { AppNav } from "@/app/components/app-nav";
import { FloatingChatWidget } from "@/app/components/floating-chat-widget";
import { LiveRefresh } from "@/app/components/live-refresh";
import { RealtimeProvider } from "@/app/components/realtime-provider";
import { isAblyConfigured } from "@/lib/ably-server";
import { getAccountRosterPublic } from "@/lib/account-roster";
import { getCurrentUser } from "@/lib/auth";
import { syncBirthdayNotifications } from "@/lib/birthday";
import { syncDeadlineNotifications } from "@/lib/deadline-notifications";
import { getNavBadgeCounts } from "@/lib/nav-badges";
import { personLabel } from "@/lib/utils";

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await Promise.all([
    syncDeadlineNotifications(user.id),
    syncBirthdayNotifications(user.id),
  ]);

  const [{ unreadCount, chatUnreadCount }, accounts] = await Promise.all([
    getNavBadgeCounts(user.id),
    getAccountRosterPublic(user.id),
  ]);

  const ablyEnabled = isAblyConfigured();

  return (
    <div className="tide-wave-bg min-h-screen">
      {!ablyEnabled ? <LiveRefresh /> : null}
      <RealtimeProvider
        userId={user.id}
        enabled={ablyEnabled}
        initialUnreadCount={unreadCount}
        initialChatUnreadCount={chatUnreadCount}
      >
        <AppNav
          displayLabel={personLabel(user)}
          unreadCount={unreadCount}
          chatUnreadCount={chatUnreadCount}
          accounts={accounts}
        />
        {children}
        <FloatingChatWidget chatUnreadCount={chatUnreadCount} />
      </RealtimeProvider>
    </div>
  );
}
