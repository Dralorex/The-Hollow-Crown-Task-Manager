import { redirect } from "next/navigation";
import { AppNav } from "@/app/components/app-nav";
import { FloatingChatWidget } from "@/app/components/floating-chat-widget";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [unreadCount, chatUnreadCount] = await Promise.all([
    prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
        type: { notIn: ["CHAT_MESSAGE", "CHAT_MENTION", "DM_REQUEST"] },
      },
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        read: false,
        type: { in: ["CHAT_MESSAGE", "CHAT_MENTION", "DM_REQUEST"] },
      },
    }),
  ]);

  return (
    <div className="rowgon-wave-bg min-h-screen">
      <AppNav
        username={user.username}
        unreadCount={unreadCount}
        chatUnreadCount={chatUnreadCount}
      />
      {children}
      <FloatingChatWidget chatUnreadCount={chatUnreadCount} />
    </div>
  );
}
