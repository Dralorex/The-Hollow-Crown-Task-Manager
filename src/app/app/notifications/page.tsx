import { format } from "date-fns";
import {
  acceptInviteAction,
  declineInviteAction,
} from "@/app/actions/workspaces";
import {
  respondDmRequestAction,
  respondFriendRequestAction,
} from "@/app/actions/social";
import { InlineActionForm } from "@/app/components/forms";
import { MarkNotificationsSeen } from "@/app/components/mark-notifications-seen";
import { WeeklyDigestPanel } from "@/app/components/weekly-digest-panel";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildWeeklyDigest } from "@/lib/weekly-digest";
import { redirect } from "next/navigation";

type NotifMeta = {
  token?: string;
  inviteId?: string;
  workspaceId?: string;
  folderId?: string;
  taskId?: string;
  friendshipId?: string;
  requestId?: string;
};

function parseMeta(meta: string | null): NotifMeta {
  if (!meta) return {};
  try {
    return JSON.parse(meta) as NotifMeta;
  } catch {
    return {};
  }
}

function typeLabel(type: string) {
  switch (type) {
    case "WORKSPACE_INVITE":
      return "Invite";
    case "FRIEND_REQUEST":
      return "Friends";
    case "DM_REQUEST":
      return "Chat request";
    case "CHAT_MESSAGE":
      return "Chat";
    case "CHAT_MENTION":
      return "Mention";
    case "TASK_ASSIGNED":
      return "Assigned";
    case "TASK_REVIEW":
      return "Review";
    case "TASK_APPROVED":
      return "Approved";
    case "TASK_REOPENED":
      return "Sent back";
    case "WEEKLY_DIGEST":
      return "Digest";
    default:
      return "Update";
  }
}

function taskHref(meta: NotifMeta) {
  if (!meta.workspaceId) return null;
  if (meta.folderId) {
    return `/app/w/${meta.workspaceId}?folder=${meta.folderId}`;
  }
  return `/app/w/${meta.workspaceId}`;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const fullUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      email: true,
      weeklyDigestEnabled: true,
      weeklyDigestLastSentAt: true,
    },
  });

  const digestPreview = await buildWeeklyDigest(user.id);

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      type: { notIn: ["CHAT_MESSAGE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const hasUnread = notifications.some((n) => !n.read);

  const inviteTokens = notifications
    .filter((n) => n.type === "WORKSPACE_INVITE")
    .map((n) => parseMeta(n.meta).token)
    .filter((t): t is string => Boolean(t));

  const pendingInvites =
    inviteTokens.length > 0
      ? await prisma.invite.findMany({
          where: {
            token: { in: inviteTokens },
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
          include: { workspace: true },
        })
      : [];
  const pendingByToken = new Map(pendingInvites.map((i) => [i.token, i]));

  const friendshipIds = notifications
    .filter((n) => n.type === "FRIEND_REQUEST")
    .map((n) => parseMeta(n.meta).friendshipId)
    .filter((t): t is string => Boolean(t));

  const pendingFriendships =
    friendshipIds.length > 0
      ? await prisma.friendship.findMany({
          where: {
            id: { in: friendshipIds },
            addresseeId: user.id,
            status: "PENDING",
          },
        })
      : [];
  const pendingFriendshipIds = new Set(pendingFriendships.map((f) => f.id));

  const dmRequestIds = notifications
    .filter((n) => n.type === "DM_REQUEST")
    .map((n) => parseMeta(n.meta).requestId)
    .filter((t): t is string => Boolean(t));

  const pendingDmRequests =
    dmRequestIds.length > 0
      ? await prisma.dmRequest.findMany({
          where: {
            id: { in: dmRequestIds },
            toUserId: user.id,
            status: "PENDING",
          },
        })
      : [];
  const pendingDmIds = new Set(pendingDmRequests.map((r) => r.id));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <MarkNotificationsSeen hasUnread={hasUnread} />
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
        Alerts
      </h1>
      <p className="mt-2 text-[#0A3D45]/70">
        Invites, reviews, and other updates. Opening this tab clears the unread badge.
      </p>

      {digestPreview ? (
        <WeeklyDigestPanel
          enabled={fullUser.weeklyDigestEnabled}
          lastSentAt={
            fullUser.weeklyDigestLastSentAt
              ? fullUser.weeklyDigestLastSentAt.toISOString()
              : null
          }
          hasEmail={Boolean(fullUser.email)}
          preview={digestPreview}
        />
      ) : null}

      <ul className="mt-8 space-y-3">
        {notifications.length === 0 ? (
          <li className="rowgon-panel p-4 text-[#0A3D45]/60">You’re all caught up.</li>
        ) : (
          notifications.map((n) => {
            const meta = parseMeta(n.meta);
            const invite =
              n.type === "WORKSPACE_INVITE" && meta.token
                ? pendingByToken.get(meta.token)
                : undefined;
            const friendshipPending =
              n.type === "FRIEND_REQUEST" &&
              meta.friendshipId &&
              pendingFriendshipIds.has(meta.friendshipId);
            const dmPending =
              n.type === "DM_REQUEST" &&
              meta.requestId &&
              pendingDmIds.has(meta.requestId);
            const href = taskHref(meta);

            return (
              <li
                key={n.id}
                className={`rowgon-panel p-4 ${n.read ? "opacity-80" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#0A3D45]/8 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0A3D45]/65">
                        {typeLabel(n.type)}
                      </span>
                      {!n.read ? (
                        <span className="text-[11px] font-semibold text-[#E85D4C]">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-semibold text-[#0A3D45]">{n.title}</p>
                    <p className="mt-1 text-sm text-[#0A3D45]/75">{n.body}</p>
                    <p className="mt-2 text-xs text-[#0A3D45]/50">
                      {format(n.createdAt, "MMM d · h:mm a")}
                    </p>
                    {href ? (
                      <a
                        href={href}
                        className="mt-2 inline-block text-sm font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                      >
                        Open workspace
                      </a>
                    ) : null}
                  </div>

                  {invite ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                      <p className="text-xs capitalize text-[#0A3D45]/60">
                        {invite.workspace.name} · {invite.role.toLowerCase()}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <InlineActionForm
                          action={acceptInviteAction}
                          submitLabel="Accept"
                          submitVariant="primary"
                          submitClassName="min-h-11 w-full sm:w-auto"
                        >
                          <input type="hidden" name="token" value={invite.token} />
                        </InlineActionForm>
                        <InlineActionForm
                          action={declineInviteAction}
                          submitLabel="Decline"
                          submitClassName="min-h-11 w-full sm:w-auto"
                        >
                          <input type="hidden" name="token" value={invite.token} />
                        </InlineActionForm>
                      </div>
                    </div>
                  ) : null}

                  {friendshipPending && meta.friendshipId ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <InlineActionForm
                        action={respondFriendRequestAction}
                        submitLabel="Accept"
                        submitVariant="primary"
                        submitClassName="min-h-11 w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="friendshipId"
                          value={meta.friendshipId}
                        />
                        <input type="hidden" name="accept" value="true" />
                      </InlineActionForm>
                      <InlineActionForm
                        action={respondFriendRequestAction}
                        submitLabel="Decline"
                        submitClassName="min-h-11 w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="friendshipId"
                          value={meta.friendshipId}
                        />
                        <input type="hidden" name="accept" value="false" />
                      </InlineActionForm>
                    </div>
                  ) : null}

                  {dmPending && meta.requestId ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <InlineActionForm
                        action={respondDmRequestAction}
                        submitLabel="Accept"
                        submitVariant="primary"
                        submitClassName="min-h-11 w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="requestId"
                          value={meta.requestId}
                        />
                        <input type="hidden" name="accept" value="true" />
                      </InlineActionForm>
                      <InlineActionForm
                        action={respondDmRequestAction}
                        submitLabel="Decline"
                        submitClassName="min-h-11 w-full sm:w-auto"
                      >
                        <input
                          type="hidden"
                          name="requestId"
                          value={meta.requestId}
                        />
                        <input type="hidden" name="accept" value="false" />
                      </InlineActionForm>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </main>
  );
}
