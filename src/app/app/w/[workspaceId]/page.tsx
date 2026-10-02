import { redirect } from "next/navigation";
import { AppLink } from "@/app/components/app-link";
import { InlineActionForm } from "@/app/components/forms";
import { FolderActions } from "@/app/components/folder-actions";
import { OnboardingFolderBubbles } from "@/app/components/onboarding-folder-bubbles";
import { WorkspaceFoldersSidebar } from "@/app/components/workspace-folders-sidebar";
import { WorkspaceAddTaskPanel } from "@/app/components/workspace-add-task-panel";
import { WorkspaceOnboardingProvider } from "@/app/components/workspace-onboarding-context";
import { WorkspaceSetupChecklist } from "@/app/components/workspace-setup-checklist";
import { OnboardingChooser } from "@/app/components/onboarding-chooser";
import { OnboardingScrollToBlink } from "@/app/components/onboarding-scroll-to-blink";
import { WorkspaceTaskList } from "@/app/components/workspace-task-list";
import { inviteMemberAction } from "@/app/actions/workspaces";
import { FriendInvitePicker } from "@/app/components/friend-invite-picker";
import { PendingInvitesDropdown } from "@/app/components/pending-invites-dropdown";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import { WorkspaceMembersPanel } from "@/app/components/workspace-members-panel";
import { WorkspaceRolesPanel } from "@/app/components/workspace-roles-panel";
import { UrgencyChipSettings } from "@/app/components/urgency-chip-settings";
import {
  PersonalWorkspaceInterfacePanel,
  WorkspaceInterfaceDefaultsPanel,
} from "@/app/components/workspace-interface-panels";
import { RoleActivityNotices } from "@/app/components/role-activity-notices";
import { MarkRoleActivitySeen } from "@/app/components/mark-role-activity-seen";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parsePersonalInterfacePrefs,
  parseWorkspaceInterfaceDefaults,
  resolveInterfacePrefs,
} from "@/lib/interface-prefs";
import { computeFolderTaskCounts, collectSubtreeFolderIds } from "@/lib/folder-counts";
import {
  buildFolderVisibility,
  canAccessFolder,
  getRoleActivityUnread,
  loadUserCustomRoleIds,
  type FolderAccessRow,
} from "@/lib/folder-access";
import { canEditContent, canManagePeople } from "@/lib/permissions";
import { compareTasksByUrgency } from "@/lib/urgency";
import { personLabel, searchRelevance } from "@/lib/utils";
import { parseTagNames } from "@/lib/tags";
import { TagFilterField } from "@/app/components/tag-filter-field";
import { WorkspacePulseStrip } from "@/app/components/workspace-pulse-strip";
import {
  ArchiveFolderControls,
  ArchiveWorkspacePanel,
} from "@/app/components/archive-controls";
import { canViewArchived, isArchived } from "@/lib/archive";
import {
  buildNestedFolderOptions,
  collectDescendantIds,
} from "@/lib/folder-tree";
import { syncDueRecurrences } from "@/lib/recurrence";

const taskInclude = {
  assignee: true,
  folder: true,
  lastUnclaimedBy: true,
  lastSentBackBy: true,
  tags: { include: { tag: true } },
  checklistItems: { orderBy: { sortOrder: "asc" as const } },
  activities: {
    orderBy: { createdAt: "desc" as const },
    take: 40,
    include: { actor: { select: { username: true, nickname: true } } },
  },
};

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    folder?: string;
    q?: string;
    tag?: string;
    setup?: string;
    inbox?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspaceId } = await params;
  const sp = await searchParams;
  const showSetup = sp.setup === "1";
  const inbox =
    sp.inbox === "mine" ? "mine" : sp.inbox === "review" ? "review" : null;

  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) redirect("/app");

  await syncDueRecurrences(workspaceId);

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  if (!canViewArchived(user.id, membership.role, workspace)) {
    redirect("/app");
  }

  const workspaceArchived = isArchived(workspace);

  const [folderRecordsAll, userRoleIds, workspaceRoles] = await Promise.all([
    prisma.folder.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      include: {
        requiredRoles: {
          select: {
            roleId: true,
            role: { select: { hideFolders: true } },
          },
        },
      },
    }),
    loadUserCustomRoleIds(membership.id),
    prisma.workspaceRole.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    }),
  ]);

  const folderRecords = folderRecordsAll.filter((f) =>
    canViewArchived(user.id, membership.role, f),
  );

  const folderAccessRows: FolderAccessRow[] = folderRecords.map((f) => ({
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    requiredRoleIds: f.requiredRoles.map((r) => r.roleId),
    hideFromUnauthorized: f.hideFromUnauthorized,
    alwaysVisible: f.alwaysVisible,
    alwaysAccessible: f.alwaysAccessible,
    roleHidesFolder: f.requiredRoles.some((r) => r.role.hideFolders),
  }));
  const foldersById = new Map(folderAccessRows.map((f) => [f.id, f]));
  const visibilityOpts = { membershipRole: membership.role };
  const visibleFolders = buildFolderVisibility(
    folderAccessRows,
    userRoleIds,
    visibilityOpts,
  );
  const accessibleFolderIds = new Set(
    visibleFolders.filter((f) => f.canAccess).map((f) => f.id),
  );

  const folders = folderRecords;
  const activeFolders = folders.filter((f) => !isArchived(f));
  const roleOptions = workspaceRoles.map((r) => ({ id: r.id, name: r.name }));

  const taskCountRows = await prisma.task.groupBy({
    by: ["folderId"],
    where: {
      workspaceId,
      status: "OPEN",
      assigneeId: null,
    },
    _count: { _all: true },
  });
  const directCounts = new Map(
    taskCountRows.map((r) => [r.folderId, r._count._all]),
  );
  const folderCounts = computeFolderTaskCounts(folders, directCounts);

  const [doneCountRows, totalCountRows] = await Promise.all([
    prisma.task.groupBy({
      by: ["folderId"],
      where: { workspaceId, status: "DONE" },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["folderId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
  ]);
  const directTotalCounts = new Map(
    totalCountRows.map((r) => [r.folderId, r._count._all]),
  );
  const folderDoneCounts = computeFolderTaskCounts(
    folders,
    new Map(doneCountRows.map((r) => [r.folderId, r._count._all])),
  );
  const folderTotalCounts = computeFolderTaskCounts(
    folders,
    directTotalCounts,
  );

  const isRoot = !inbox && !sp.folder;
  const currentFolderId = inbox ? null : (sp.folder ?? null);
  const currentFolder = currentFolderId
    ? (folders.find((f) => f.id === currentFolderId) ?? null)
    : null;
  const folderArchived = Boolean(currentFolder && isArchived(currentFolder));

  if (currentFolderId && !currentFolder) {
    redirect(`/app/w/${workspaceId}`);
  }

  if (
    currentFolder &&
    !canAccessFolder(currentFolder.id, foldersById, userRoleIds, visibilityOpts)
  ) {
    redirect(`/app/w/${workspaceId}`);
  }

  const childFolders = inbox
    ? []
    : visibleFolders.filter((f) => {
        if (f.parentId !== (currentFolder?.id ?? null)) return false;
        const record = folders.find((row) => row.id === f.id);
        if (!record) return false;
        if (!currentFolder || !isArchived(currentFolder)) {
          return !isArchived(record);
        }
        return true;
      });

  const parentFolder = currentFolder?.parentId
    ? (folders.find((f) => f.id === currentFolder.parentId) ?? null)
    : null;

  const backHref = inbox
    ? `/app/w/${workspaceId}`
    : currentFolder
      ? parentFolder
        ? `/app/w/${workspaceId}?folder=${parentFolder.id}`
        : `/app/w/${workspaceId}`
      : null;
  const backLabel = inbox
    ? "All Tasks"
    : currentFolder
      ? parentFolder
        ? parentFolder.name
        : "All Tasks"
      : null;

  const q = sp.q?.trim() ?? "";
  const tagFilterRaw = sp.tag?.trim() ?? "";
  const tagFilters = parseTagNames(tagFilterRaw);

  const tagScopeFolderIds = collectSubtreeFolderIds(
    currentFolder?.id ?? null,
    folders,
    accessibleFolderIds,
  );

  // Folder browse stays local; tag filter includes the folder subtree so
  // tags from lower paths remain useful.
  const inboxFolderFilter = canManagePeople(membership.role)
    ? {}
    : { folderId: { in: [...accessibleFolderIds] } };

  const taskFolderIds = inbox
    ? []
    : isRoot
      ? [...accessibleFolderIds]
      : tagFilters.length > 0 && currentFolder
        ? tagScopeFolderIds
        : currentFolder
          ? [currentFolder.id]
          : [];

  let tasks =
    inbox === "mine"
      ? await prisma.task.findMany({
          where: {
            workspaceId,
            assigneeId: user.id,
            status: { in: ["OPEN", "CLAIMED", "IN_REVIEW"] },
            ...inboxFolderFilter,
          },
          include: taskInclude,
        })
      : inbox === "review"
        ? await prisma.task.findMany({
            where: {
              workspaceId,
              status: "IN_REVIEW",
              ...inboxFolderFilter,
            },
            include: taskInclude,
          })
        : taskFolderIds.length === 0
          ? []
          : await prisma.task.findMany({
              where: {
                workspaceId,
                folderId: { in: taskFolderIds },
              },
              include: taskInclude,
            });

  const [publicTagsInScope, privateTagsForUser] = await Promise.all([
    tagScopeFolderIds.length === 0
      ? Promise.resolve([] as { name: string }[])
      : prisma.tag.findMany({
          where: {
            workspaceId,
            isPublic: true,
            tasks: {
              some: { task: { folderId: { in: tagScopeFolderIds } } },
            },
          },
          orderBy: { name: "asc" },
          select: { name: true },
        }),
    prisma.tag.findMany({
      where: {
        workspaceId,
        isPublic: false,
        creatorId: user.id,
      },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const publicTagOptions = publicTagsInScope.map((t) => t.name);
  const privateTagOptions = privateTagsForUser.map((t) => t.name);
  const searchTagOptions = Array.from(
    new Set([...publicTagOptions, ...privateTagOptions]),
  ).sort((a, b) => a.localeCompare(b));

  tasks = tasks
    .map((t) => ({
      ...t,
      tags: t.tags.filter(
        (tt) =>
          tt.tag.isPublic ||
          (tt.tag.creatorId === user.id && t.assigneeId === user.id),
      ),
    }))
    .sort(compareTasksByUrgency);

  if (q || tagFilters.length > 0) {
    tasks = tasks
      .map((t) => ({
        task: t,
        relevance: q ? searchRelevance(q, t.name) : 1,
      }))
      .filter(({ task, relevance }) => {
        if (q && relevance <= 0) return false;
        if (tagFilters.length > 0) {
          const names = new Set(task.tags.map((tt) => tt.tag.name));
          // All selected tags must be present (AND).
          if (!tagFilters.every((tag) => names.has(tag))) return false;
        }
        return true;
      })
      .sort((a, b) => b.relevance - a.relevance || compareTasksByUrgency(a.task, b.task))
      .map(({ task }) => task);
  }

  const canEditBase = canEditContent(membership.role);
  const canEdit =
    canEditBase &&
    !workspaceArchived &&
    !folderArchived &&
    (!currentFolder || accessibleFolderIds.has(currentFolder.id));
  const canInvite = canManagePeople(membership.role) && !workspaceArchived;
  const canArchive = canManagePeople(membership.role);
  const canManageRoles = canManagePeople(membership.role);

  const personalInterface = parsePersonalInterfacePrefs(user.interfacePrefsJson);
  const workspaceInterfaceDefaults = parseWorkspaceInterfaceDefaults(
    workspace.interfaceDefaultsJson,
  );
  const ui = resolveInterfacePrefs({
    personal: personalInterface,
    workspaceDefaults: workspaceInterfaceDefaults,
    applyToMembers: workspace.interfaceApplyToMembers,
  });
  const showPulse = ui.pulse;
  const showInboxTabs = ui.inbox;

  const roleActivity = await getRoleActivityUnread(
    user.id,
    workspaceId,
    userRoleIds,
  );

  const currentRequiredRoleIds = currentFolder
    ? (foldersById.get(currentFolder.id)?.requiredRoleIds ?? [])
    : [];
  const markSeenRoleIds = currentRequiredRoleIds.filter((id) =>
    userRoleIds.has(id),
  );

  const pendingInvites = canInvite
    ? await prisma.invite.findMany({
        where: { workspaceId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const workspaceMembers = await prisma.membership.findMany({
    where: { workspaceId },
    include: {
      user: true,
      customRoles: { include: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const [acceptedFriendships, pendingFriendships] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
      include: { requester: true, addressee: true },
    }),
    prisma.friendship.findMany({
      where: {
        status: "PENDING",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
    }),
  ]);

  const friendIds = new Set(
    acceptedFriendships.map((row) =>
      row.requesterId === user.id ? row.addresseeId : row.requesterId,
    ),
  );
  const pendingFriendIds = new Set(
    pendingFriendships.flatMap((row) => [row.requesterId, row.addresseeId]),
  );

  const inviteFriends = canInvite
    ? acceptedFriendships.map((row) => {
        const friend =
          row.requesterId === user.id ? row.addressee : row.requester;
        return {
          id: friend.id,
          username: friend.username,
          label: personLabel(friend),
        };
      })
    : [];

  const memberRows = workspaceMembers.map((m) => ({
    userId: m.userId,
    username: m.user.username,
    label: personLabel(m.user),
    role: m.role,
    customRoleIds: m.customRoles.map((cr) => cr.roleId),
    customRoleNames: m.customRoles.map((cr) => cr.role.name),
    isSelf: m.userId === user.id,
    isFriend: friendIds.has(m.userId),
    requestPending: pendingFriendIds.has(m.userId),
  }));

  const archiveMembers = workspaceMembers.map((m) => ({
    id: m.user.id,
    username: m.user.username,
  }));

  const assignableMembers = (
    currentFolder
      ? workspaceMembers.filter((m) =>
          canAccessFolder(
            currentFolder.id,
            foldersById,
            new Set(m.customRoles.map((cr) => cr.roleId)),
            { membershipRole: m.role },
          ),
        )
      : workspaceMembers
  ).map((m) => ({
    id: m.user.id,
    username: m.user.username,
  }));

  const allWorkspaceTasks = await prisma.task.findMany({
    where: {
      workspaceId,
      ...(canManagePeople(membership.role)
        ? {}
        : { folderId: { in: [...accessibleFolderIds] } }),
    },
    select: {
      id: true,
      status: true,
      dueDate: true,
      assigneeId: true,
      folderId: true,
    },
  });

  const now = new Date();
  const counts = showPulse
    ? {
        open: allWorkspaceTasks.filter((t) => t.status === "OPEN").length,
        claimed: allWorkspaceTasks.filter((t) => t.status === "CLAIMED").length,
        inReview: allWorkspaceTasks.filter((t) => t.status === "IN_REVIEW")
          .length,
        overdue: allWorkspaceTasks.filter(
          (t) => t.dueDate && t.dueDate < now && t.status !== "DONE",
        ).length,
        done: allWorkspaceTasks.filter((t) => t.status === "DONE").length,
      }
    : null;

  const myClaimedCount = allWorkspaceTasks.filter(
    (t) =>
      t.assigneeId === user.id &&
      (t.status === "CLAIMED" || t.status === "OPEN"),
  ).length;
  const needsReviewCount = allWorkspaceTasks.filter(
    (t) => t.status === "IN_REVIEW",
  ).length;

  const savedTemplates = await prisma.folderTemplate.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, treeJson: true },
  });

  const taskCount = allWorkspaceTasks.length;
  const hasFolder = activeFolders.length > 0;
  const hasTask = taskCount > 0;
  const hasInvite = pendingInvites.length > 0 || workspaceMembers.length > 1;

  const templateParentFolder =
    currentFolder && !isArchived(currentFolder) ? currentFolder : null;

  const moveableFolders = activeFolders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }));

  const taskMoveOptions = buildNestedFolderOptions(moveableFolders, {
    includeRoot: false,
  });

  function folderActionsProps(folderId: string, folderName: string) {
    const row = foldersById.get(folderId);
    const exclude = collectDescendantIds(moveableFolders, folderId);
    return {
      workspaceId,
      folderId,
      folderName,
      canManageRoles,
      workspaceRoles: roleOptions,
      requiredRoleIds: row?.requiredRoleIds ?? [],
      hideFromUnauthorized: row?.hideFromUnauthorized ?? false,
      alwaysVisible: row?.alwaysVisible ?? false,
      alwaysAccessible: row?.alwaysAccessible ?? false,
      currentParentId: row?.parentId ?? null,
      moveOptions: buildNestedFolderOptions(moveableFolders, {
        excludeIds: exclude,
        includeRoot: true,
      }),
    };
  }

  const urgencyChips = {
    showBase: workspace.showUrgencyBase,
    showDate: workspace.showUrgencyDate,
    showTotal: workspace.showUrgencyTotal,
  };

  const sectionTitle = inbox
    ? inbox === "mine"
      ? "My claimed"
      : "Needs review"
    : currentFolder
      ? currentFolder.name
      : "All Tasks";

  const sectionDescription = inbox
    ? inbox === "mine"
      ? "Tasks you’ve claimed across every folder."
      : "Waiting on Editor+ approval across the workspace."
    : folderArchived
      ? "Archived folder — history preserved; new tasks paused."
      : isRoot
        ? "Every task in this workspace, grouped by status. Sort follows the urgency chips that are turned on."
        : "Subfolders and tasks grouped by status. Sort follows the urgency chips that are turned on.";

  const emptyMessage = inbox
    ? inbox === "mine"
      ? "Nothing claimed right now. Open a folder and pick up a task."
      : "No tasks waiting for review."
    : folderArchived
      ? "No tasks in this archived folder."
      : undefined;

  const listIsRoot = Boolean(inbox) || isRoot;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <WorkspaceOnboardingProvider
        workspaceId={workspaceId}
        forceShow={showSetup}
        hasFolder={hasFolder}
        hasTask={hasTask}
        inFolder={Boolean(currentFolder)}
        hasRole={workspaceRoles.length > 0}
        canManageRoles={canManageRoles}
        canEdit={canEditBase && !workspaceArchived}
        enabled={ui.onboarding}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <AppLink
              href="/app"
              className="inline-flex items-center gap-1 text-sm text-[#0A3D45]/60 hover:underline"
              compactPending
            >
              ← Workspaces
            </AppLink>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
              {workspace.name}
              {workspaceArchived ? (
                <span className="ml-3 align-middle text-sm font-sans font-semibold uppercase tracking-wide text-[#E85D4C]">
                  Archived
                </span>
              ) : null}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm capitalize text-[#0A3D45]/60">
                You’re {membership.role.toLowerCase()}
              </p>
              {canArchive && !workspaceArchived ? (
                <ArchiveWorkspacePanel
                  workspaceId={workspaceId}
                  isArchived={false}
                  members={archiveMembers}
                />
              ) : null}
            </div>
          </div>

          <form className="flex flex-wrap gap-2" action={`/app/w/${workspaceId}`} method="get">
            {currentFolder ? (
              <input type="hidden" name="folder" value={currentFolder.id} />
            ) : null}
            {inbox ? <input type="hidden" name="inbox" value={inbox} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search names…"
              className="tide-input min-w-[12rem]"
            />
            <TagFilterField tags={searchTagOptions} defaultValue={tagFilterRaw} />
            <button type="submit" className="tide-btn-secondary text-sm">
              Search
            </button>
          </form>
        </div>

        {workspaceArchived ? (
          <div className="mt-4">
            {canArchive ? (
              <ArchiveWorkspacePanel
                workspaceId={workspaceId}
                isArchived
                members={archiveMembers}
              />
            ) : (
              <div className="rounded-xl border border-[#E85D4C]/25 bg-[#E85D4C]/8 px-3 py-2.5 text-sm text-[#0A3D45]/80">
                This workspace is archived. History stays visible; new work is
                paused.
              </div>
            )}
          </div>
        ) : null}

        {ui.onboarding ? (
          <>
            <OnboardingChooser />
            <OnboardingScrollToBlink />
            <WorkspaceSetupChecklist
              hasFolder={hasFolder}
              hasTask={hasTask}
              hasInvite={hasInvite}
              canInvite={canInvite}
              inFolder={Boolean(currentFolder)}
            />
          </>
        ) : null}

        <WorkspacePulseStrip
          workspaceId={workspaceId}
          counts={counts}
          canReview={canEditBase && !workspaceArchived}
          inbox={inbox}
          myClaimedCount={myClaimedCount}
          needsReviewCount={needsReviewCount}
          showPulse={showPulse}
          showInbox={showInboxTabs}
        />

        {roleActivity.length > 0 ? (
          <div className="mt-6">
            <RoleActivityNotices workspaceId={workspaceId} items={roleActivity} />
          </div>
        ) : null}

        {markSeenRoleIds.length > 0 ? (
          <MarkRoleActivitySeen
            workspaceId={workspaceId}
            roleIds={markSeenRoleIds}
          />
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className={`space-y-4 ${inbox ? "hidden lg:block" : ""}`}>
            <div className="tide-panel p-4">
              <WorkspaceFoldersSidebar
                workspaceId={workspaceId}
                parentId={currentFolder?.id ?? null}
                parentName={currentFolder?.name ?? null}
                roleNames={roleOptions.map((r) => r.name)}
                canSetAccess={canManageRoles}
                canEdit={canEdit}
                templateParentId={templateParentFolder?.id ?? null}
                templateParentName={templateParentFolder?.name ?? null}
                currentFolderId={currentFolder?.id ?? null}
                canSaveTemplates={canArchive}
                savedTemplates={savedTemplates}
              />
            </div>

            {canInvite && ui.sidebarInvite ? (
              <div className="tide-panel p-4">
                <ChatSidebarSection
                  title="Invite"
                  description="Invite a friend by username, or type an email. They’ll get a link to join this workspace."
                >
                  <InlineActionForm
                    className="flex flex-col gap-2"
                    action={inviteMemberAction}
                    submitLabel="Send invite"
                  >
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <FriendInvitePicker
                      friends={inviteFriends}
                      targetName="target"
                      excludeIds={workspaceMembers.map((m) => m.userId)}
                    />
                    <select name="role" className="tide-input text-sm" defaultValue="MEMBER">
                      <option value="ADMIN">Admin</option>
                      <option value="EDITOR">Editor</option>
                      <option value="MEMBER">Member</option>
                    </select>
                  </InlineActionForm>
                  <PendingInvitesDropdown
                    invites={pendingInvites.map((inv) => ({
                      id: inv.id,
                      label: inv.targetUsername ?? inv.targetEmail ?? "invite",
                      role: inv.role,
                      token: inv.token,
                    }))}
                  />
                </ChatSidebarSection>
              </div>
            ) : null}

            {ui.sidebarRoles ? (
              <WorkspaceRolesPanel
                workspaceId={workspaceId}
                roles={workspaceRoles.map((r) => ({
                  id: r.id,
                  name: r.name,
                  memberCount: r._count.members,
                  hideFolders: r.hideFolders,
                }))}
                canManage={canManageRoles}
              />
            ) : null}

            <UrgencyChipSettings
              workspaceId={workspaceId}
              showBase={workspace.showUrgencyBase}
              showDate={workspace.showUrgencyDate}
              showTotal={workspace.showUrgencyTotal}
              canManage={canManageRoles}
            />

            {canManageRoles ? (
              <WorkspaceInterfaceDefaultsPanel
                workspaceId={workspaceId}
                applyToMembers={workspace.interfaceApplyToMembers}
                defaults={workspaceInterfaceDefaults}
              />
            ) : null}

            {user.showInterfaceTogglesInWorkspace ? (
              <PersonalWorkspaceInterfacePanel prefs={personalInterface} />
            ) : null}

            {ui.sidebarMembers ? (
              <WorkspaceMembersPanel
                workspaceId={workspaceId}
                members={memberRows}
                viewerRole={membership.role}
                workspaceRoles={roleOptions}
              />
            ) : null}
          </aside>

          <section className="space-y-6">
            <div className="tide-panel p-5">
              {backHref && backLabel ? (
                <AppLink
                  href={backHref}
                  className="inline-flex items-center gap-1 text-sm text-[#0A3D45]/60 hover:underline"
                  compactPending
                >
                  ← {backLabel}
                </AppLink>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
                  {sectionTitle}
                  {folderArchived ? (
                    <span className="ml-2 align-middle text-sm font-sans font-semibold uppercase tracking-wide text-[#E85D4C]">
                      Archived
                    </span>
                  ) : null}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {!inbox && currentFolder ? (
                    <AppLink
                      href={`/app/w/${workspaceId}`}
                      className="tide-btn-secondary inline-flex items-center gap-1 !px-3 !py-1.5 text-xs"
                      compactPending
                    >
                      See All Tasks
                    </AppLink>
                  ) : null}
                  {!inbox && canEdit && currentFolder ? (
                    <FolderActions
                      {...folderActionsProps(currentFolder.id, currentFolder.name)}
                    />
                  ) : null}
                  {!inbox &&
                  canArchive &&
                  currentFolder &&
                  !workspaceArchived &&
                  !folderArchived ? (
                    <ArchiveFolderControls
                      workspaceId={workspaceId}
                      folderId={currentFolder.id}
                      folderName={currentFolder.name}
                      isArchived={false}
                      members={archiveMembers}
                    />
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-[#0A3D45]/60">{sectionDescription}</p>

              {!inbox &&
              canArchive &&
              currentFolder &&
              !workspaceArchived &&
              folderArchived ? (
                <ArchiveFolderControls
                  workspaceId={workspaceId}
                  folderId={currentFolder.id}
                  folderName={currentFolder.name}
                  isArchived
                  members={archiveMembers}
                />
              ) : null}

              {!inbox && childFolders.length > 0 ? (
                <OnboardingFolderBubbles
                  workspaceId={workspaceId}
                  showStats={ui.folderStats}
                  childFolders={childFolders.map((f) => ({
                    id: f.id,
                    name: f.name,
                    locked: f.locked,
                    restricted: f.requiredRoleIds.length > 0,
                    done: folderDoneCounts.get(f.id) ?? 0,
                    total: folderTotalCounts.get(f.id) ?? 0,
                    unclaimed: folderCounts.get(f.id) ?? 0,
                    showActions: canEdit && f.canAccess,
                    folderActions: folderActionsProps(f.id, f.name),
                  }))}
                />
              ) : null}

              {!inbox && isRoot && canEdit ? (
                <p className="mt-4 text-sm text-[#0A3D45]/65">
                  Open a folder to add tasks. All Tasks lists everything by status.
                </p>
              ) : null}
            </div>

            {!inbox && canEdit && currentFolder ? (
              <WorkspaceAddTaskPanel
                workspaceId={workspaceId}
                folderId={currentFolder.id}
                publicTagOptions={publicTagOptions}
                assignableMembers={assignableMembers}
              />
            ) : null}

            <WorkspaceTaskList
              workspaceId={workspaceId}
              userId={user.id}
              canEdit={canEdit}
              isRoot={listIsRoot}
              tasks={tasks}
              publicTagOptions={publicTagOptions}
              privateTagOptions={privateTagOptions}
              urgencyChips={urgencyChips}
              assignableMembers={assignableMembers}
              moveOptions={taskMoveOptions}
              emptyMessage={emptyMessage}
              showRecurrenceChip={ui.recurrenceChip}
              showTaskHistory={ui.taskHistory}
            />
          </section>
        </div>
      </WorkspaceOnboardingProvider>
    </main>
  );
}
