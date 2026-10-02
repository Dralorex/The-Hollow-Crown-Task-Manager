import { format } from "date-fns";
import {
  acceptInviteAction,
  declineInviteAction,
} from "@/app/actions/workspaces";
import {
  respondDmRequestAction,
  respondFriendRequestAction,
} from "@/app/actions/social";
import {
  respondBirthdaySharePromptAction,
  respondWorkspaceBirthdayRequestAction,
} from "@/app/actions/birthday";
import { AppLink } from "@/app/components/app-link";
import { InlineActionForm } from "@/app/components/forms";
import { MarkNotificationsSeen } from "@/app/components/mark-notifications-seen";
import { RoleActivityNotices } from "@/app/components/role-activity-notices";
import { WeeklyDigestPanel } from "@/app/components/weekly-digest-panel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRoleActivityUnread } from "@/lib/folder-access";
import { buildWeeklyDigest } from "@/lib/weekly-digest";

type NotifMeta = {
  token?: string;
  inviteId?: string;
  workspaceId?: string;
  folderId?: string;
  taskId?: string;
  friendshipId?: string;
  requestId?: string;
  groupId?: string;
  fromUserId?: string;
  viewerId?: string;
  subjectId?: string;
  kind?: "friend" | "workspace";
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
    case "DEADLINE_SOON":
      return "Deadline";
    case "TASK_REVIEW":
      return "Review";
    case "TASK_APPROVED":
      return "Approved";
    case "TASK_REOPENED":
      return "Reopened";
    case "BIRTHDAY_SHARE_PROMPT":
      return "Birthday";
    case "WORKSPACE_BIRTHDAY_REQUEST":
      return "Birthday request";
    case "WORKSPACE_BIRTHDAY_DECISION":
    case "BIRTHDAY_TODAY":
      return "Birthday";
    case "WEEKLY_DIGEST":
      return "Digest";
    default:
      return "Update";
  }
}

export default async function NotificationsPage() {
  const user = await requireUser();

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
      type: { notIn: ["CHAT_MESSAGE", "DM_REQUEST"] },
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

  const birthdayPromptMeta = notifications
    .filter((notification) => notification.type === "BIRTHDAY_SHARE_PROMPT")
    .map((notification) => parseMeta(notification.meta));
  const friendPromptViewerIds = birthdayPromptMeta
    .filter((meta) => meta.kind === "friend")
    .map((meta) => meta.viewerId)
    .filter((id): id is string => Boolean(id));
  const pendingBirthdayShares =
    friendPromptViewerIds.length > 0
      ? await prisma.birthdayShare.findMany({
          where: {
            ownerId: user.id,
            viewerId: { in: friendPromptViewerIds },
            status: "PENDING",
          },
        })
      : [];
  const pendingBirthdayViewerIds = new Set(
    pendingBirthdayShares.map((share) => share.viewerId),
  );

  const birthdayPromptWorkspaceIds = birthdayPromptMeta
    .filter((meta) => meta.kind === "workspace")
    .map((meta) => meta.workspaceId)
    .filter((id): id is string => Boolean(id));
  const decidedWorkspacePrompts =
    birthdayPromptWorkspaceIds.length > 0
      ? await prisma.workspaceBirthdayRequest.findMany({
          where: {
            subjectId: user.id,
            workspaceId: { in: birthdayPromptWorkspaceIds },
          },
        })
      : [];
  const decidedWorkspaceIds = new Set(
    decidedWorkspacePrompts.map((request) => request.workspaceId),
  );

  const birthdayRequestIds = notifications
    .filter((notification) => notification.type === "WORKSPACE_BIRTHDAY_REQUEST")
    .map((notification) => parseMeta(notification.meta).requestId)
    .filter((id): id is string => Boolean(id));
  const pendingWorkspaceBirthdayRequests =
    birthdayRequestIds.length > 0
      ? await prisma.workspaceBirthdayRequest.findMany({
          where: {
            id: { in: birthdayRequestIds },
            status: "PENDING",
            workspace: { ownerId: user.id },
          },
        })
      : [];
  const pendingWorkspaceBirthdayRequestIds = new Set(
    pendingWorkspaceBirthdayRequests.map((request) => request.id),
  );

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: {
      customRoles: { select: { roleId: true } },
      workspace: { select: { id: true, name: true } },
    },
  });

  const roleActivityByWorkspace = (
    await Promise.all(
      memberships.map(async (m) => {
        const items = await getRoleActivityUnread(
          user.id,
          m.workspaceId,
          new Set(m.customRoles.map((cr) => cr.roleId)),
        );
        return items.map((item) => ({
          ...item,
          workspaceId: m.workspaceId,
          workspaceName: m.workspace.name,
        }));
      }),
    )
  ).flat();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <MarkNotificationsSeen hasUnread={hasUnread} />
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
        Alerts
      </h1>
      <p className="mt-2 text-[#0A3D45]/70">
        Invites, friends, deadlines, role task activity, and task updates. Chat
        messages and DM requests live under Chat. Opening this tab clears the
        unread badge for inbox items (role activity is cleared per role when
        marked seen or when         you open that role’s folders).
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

      {roleActivityByWorkspace.length > 0 ? (
        <div className="mt-8 space-y-4">
          {memberships.map((m) => {
            const items = roleActivityByWorkspace.filter(
              (row) => row.workspaceId === m.workspaceId,
            );
            if (items.length === 0) return null;
            return (
              <section key={m.workspaceId}>
                <h2 className="mb-2 text-sm font-semibold text-[#0A3D45]/70">
                  {m.workspace.name} · role activity
                </h2>
                <RoleActivityNotices
                  workspaceId={m.workspaceId}
                  items={items.map(({ roleId, roleName, count }) => ({
                    roleId,
                    roleName,
                    count,
                  }))}
                />
              </section>
            );
          })}
        </div>
      ) : null}

      <ul className="mt-8 space-y-3">
        {notifications.length === 0 && roleActivityByWorkspace.length === 0 ? (
          <li className="text-[#0A3D45]/60">You’re all caught up.</li>
        ) : notifications.length === 0 ? null : (
          notifications.map((n) => {
            const meta = parseMeta(n.meta);
            const invite =
              n.type === "WORKSPACE_INVITE" && meta.token
                ? pendingByToken.get(meta.token)
                : undefined;
            const canRespondFriend =
              n.type === "FRIEND_REQUEST" &&
              meta.friendshipId &&
              pendingFriendshipIds.has(meta.friendshipId);
            const canRespondDm =
              n.type === "DM_REQUEST" &&
              meta.requestId &&
              pendingDmIds.has(meta.requestId);
            const canRespondBirthdayPrompt =
              n.type === "BIRTHDAY_SHARE_PROMPT" &&
              ((meta.kind === "friend" &&
                Boolean(
                  meta.viewerId &&
                    pendingBirthdayViewerIds.has(meta.viewerId),
                )) ||
                (meta.kind === "workspace" &&
                  Boolean(
                    meta.workspaceId &&
                      !decidedWorkspaceIds.has(meta.workspaceId),
                  )));
            const canRespondWorkspaceBirthday =
              n.type === "WORKSPACE_BIRTHDAY_REQUEST" &&
              Boolean(
                meta.requestId &&
                  pendingWorkspaceBirthdayRequestIds.has(meta.requestId),
              );

            const deepLink =
              n.type === "CHAT_MESSAGE" && meta.groupId
                ? `/app/chat?group=${meta.groupId}`
                : n.type === "DEADLINE_SOON" && meta.workspaceId
                  ? `/app/w/${meta.workspaceId}${meta.folderId ? `?folder=${meta.folderId}` : ""}`
                  : n.type === "TASK_REVIEW" ||
                      n.type === "TASK_APPROVED" ||
                      n.type === "TASK_REOPENED"
                    ? meta.workspaceId
                      ? `/app/w/${meta.workspaceId}`
                      : "/app"
                    : null;

            return (
              <li key={n.id} className="tide-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#0A3D45]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/70">
                        {typeLabel(n.type)}
                      </span>
                      {!n.read ? (
                        <span className="rounded-full bg-[#E85D4C] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-semibold text-[#0A3D45]">{n.title}</p>
                    <p className="mt-1 text-sm text-[#0A3D45]/75">{n.body}</p>
                    <p className="mt-2 text-xs text-[#0A3D45]/50">
                      {format(n.createdAt, "MMM d · HH:mm")}
                    </p>
                    {deepLink ? (
                      <AppLink
                        href={deepLink}
                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#0A3D45] underline-offset-2 hover:underline"
                        compactPending
                      >
                        Open →
                      </AppLink>
                    ) : null}
                  </div>

                  {invite ? (
                    <div className="flex flex-col gap-2 sm:items-end">
                      <p className="text-xs capitalize text-[#0A3D45]/60">
                        {invite.workspace.name} · {invite.role.toLowerCase()}
                      </p>
                      <div className="flex gap-2">
                        <InlineActionForm
                          action={acceptInviteAction}
                          submitLabel="Accept"
                        >
                          <input type="hidden" name="token" value={invite.token} />
                        </InlineActionForm>
                        <InlineActionForm
                          action={declineInviteAction}
                          submitLabel="Decline"
                        >
                          <input type="hidden" name="token" value={invite.token} />
                        </InlineActionForm>
                      </div>
                    </div>
                  ) : null}

                  {canRespondFriend && meta.friendshipId ? (
                    <div className="flex gap-2">
                      <InlineActionForm
                        action={respondFriendRequestAction}
                        submitLabel="Accept"
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

                  {canRespondDm && meta.requestId ? (
                    <div className="flex gap-2">
                      <InlineActionForm
                        action={respondDmRequestAction}
                        submitLabel="Accept"
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

                  {canRespondBirthdayPrompt && meta.kind ? (
                    <div className="flex gap-2">
                      <InlineActionForm
                        action={respondBirthdaySharePromptAction}
                        submitLabel="Accept"
                      >
                        <input type="hidden" name="kind" value={meta.kind} />
                        <input
                          type="hidden"
                          name="notificationId"
                          value={n.id}
                        />
                        {meta.viewerId ? (
                          <input
                            type="hidden"
                            name="viewerId"
                            value={meta.viewerId}
                          />
                        ) : null}
                        {meta.workspaceId ? (
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={meta.workspaceId}
                          />
                        ) : null}
                        <input type="hidden" name="accept" value="true" />
                      </InlineActionForm>
                      <InlineActionForm
                        action={respondBirthdaySharePromptAction}
                        submitLabel="Decline"
                      >
                        <input type="hidden" name="kind" value={meta.kind} />
                        <input
                          type="hidden"
                          name="notificationId"
                          value={n.id}
                        />
                        {meta.viewerId ? (
                          <input
                            type="hidden"
                            name="viewerId"
                            value={meta.viewerId}
                          />
                        ) : null}
                        {meta.workspaceId ? (
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={meta.workspaceId}
                          />
                        ) : null}
                        <input type="hidden" name="accept" value="false" />
                      </InlineActionForm>
                    </div>
                  ) : null}

                  {canRespondWorkspaceBirthday && meta.requestId ? (
                    <div className="flex gap-2">
                      <InlineActionForm
                        action={respondWorkspaceBirthdayRequestAction}
                        submitLabel="Accept"
                      >
                        <input
                          type="hidden"
                          name="requestId"
                          value={meta.requestId}
                        />
                        <input
                          type="hidden"
                          name="notificationId"
                          value={n.id}
                        />
                        <input type="hidden" name="accept" value="true" />
                      </InlineActionForm>
                      <InlineActionForm
                        action={respondWorkspaceBirthdayRequestAction}
                        submitLabel="Decline"
                      >
                        <input
                          type="hidden"
                          name="requestId"
                          value={meta.requestId}
                        />
                        <input
                          type="hidden"
                          name="notificationId"
                          value={n.id}
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
