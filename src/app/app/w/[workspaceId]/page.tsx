import { redirect } from "next/navigation";
import Link from "next/link";
import { InlineActionForm } from "@/app/components/forms";
import { FolderActions } from "@/app/components/folder-actions";
import { FolderBubble } from "@/app/components/folder-bubble";
import { CreateFolderForm } from "@/app/components/create-folder-form";
import { WorkspaceTaskList } from "@/app/components/workspace-task-list";
import { DueDateField } from "@/app/components/due-date-field";
import { PriorityField } from "@/app/components/priority-field";
import { TagSuggestInput } from "@/app/components/tag-suggest-input";
import {
  createTaskAction,
} from "@/app/actions/tasks";
import { inviteMemberAction } from "@/app/actions/workspaces";
import { FriendInvitePicker } from "@/app/components/friend-invite-picker";
import { PendingInvitesDropdown } from "@/app/components/pending-invites-dropdown";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import { WorkspaceMembersPanel } from "@/app/components/workspace-members-panel";
import { WorkspaceRolesPanel } from "@/app/components/workspace-roles-panel";
import { UrgencyChipSettings } from "@/app/components/urgency-chip-settings";
import { RoleActivityNotices } from "@/app/components/role-activity-notices";
import { MarkRoleActivitySeen } from "@/app/components/mark-role-activity-seen";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ folder?: string; q?: string; tag?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { workspaceId } = await params;
  const sp = await searchParams;

  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership) redirect("/app");

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  const [folderRecords, userRoleIds, workspaceRoles] = await Promise.all([
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

  const folderAccessRows: FolderAccessRow[] = folderRecords.map((f) => ({
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    requiredRoleIds: f.requiredRoles.map((r) => r.roleId),
    hideFromUnauthorized: f.hideFromUnauthorized,
    alwaysVisible: f.alwaysVisible,
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

  // All Tasks = no folder query param. Same status sections as folders.
  const isRoot = !sp.folder;
  const currentFolderId = sp.folder ?? null;
  const currentFolder = currentFolderId
    ? folders.find((f) => f.id === currentFolderId) ?? null
    : null;

  if (currentFolderId && !currentFolder) {
    redirect(`/app/w/${workspaceId}`);
  }

  if (
    currentFolder &&
    !canAccessFolder(currentFolder.id, foldersById, userRoleIds, visibilityOpts)
  ) {
    redirect(`/app/w/${workspaceId}`);
  }

  const childFolders = visibleFolders.filter(
    (f) => f.parentId === (currentFolder?.id ?? null),
  );

  const parentFolder = currentFolder?.parentId
    ? folders.find((f) => f.id === currentFolder.parentId) ?? null
    : null;

  const backHref = currentFolder
    ? parentFolder
      ? `/app/w/${workspaceId}?folder=${parentFolder.id}`
      : `/app/w/${workspaceId}`
    : null;
  const backLabel = currentFolder
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
  const taskFolderIds = isRoot
    ? [...accessibleFolderIds]
    : tagFilters.length > 0 && currentFolder
      ? tagScopeFolderIds
      : currentFolder
        ? [currentFolder.id]
        : [];

  let tasks =
    taskFolderIds.length === 0
      ? []
      : await prisma.task.findMany({
          where: {
            workspaceId,
            folderId: { in: taskFolderIds },
          },
          include: {
            assignee: true,
            folder: true,
            lastUnclaimedBy: true,
            lastSentBackBy: true,
            tags: { include: { tag: true } },
          },
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

  const canEdit = canEditContent(membership.role);
  const canInvite = canManagePeople(membership.role);
  const canManageRoles = canManagePeople(membership.role);

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

  function folderActionsProps(folderId: string, folderName: string) {
    const row = foldersById.get(folderId);
    return {
      workspaceId,
      folderId,
      folderName,
      canManageRoles,
      workspaceRoles: roleOptions,
      requiredRoleIds: row?.requiredRoleIds ?? [],
      hideFromUnauthorized: row?.hideFromUnauthorized ?? false,
      alwaysVisible: row?.alwaysVisible ?? false,
    };
  }

  const urgencyChips = {
    showBase: workspace.showUrgencyBase,
    showDate: workspace.showUrgencyDate,
    showTotal: workspace.showUrgencyTotal,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app" className="text-sm text-[#0A3D45]/60 hover:underline">
              ← Workspaces
            </Link>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
              {workspace.name}
            </h1>
            <p className="text-sm capitalize text-[#0A3D45]/60">
              You’re {membership.role.toLowerCase()}
            </p>
          </div>

          <form className="flex flex-wrap gap-2" action={`/app/w/${workspaceId}`} method="get">
            {currentFolder ? (
              <input type="hidden" name="folder" value={currentFolder.id} />
            ) : null}
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
          <aside className="space-y-4">
            <div className="tide-panel p-4">
              <ChatSidebarSection
                title="Add Folders"
                description="Create a folder here. Browse folders from the main panel."
              >
                {canEdit ? (
                  <CreateFolderForm
                    workspaceId={workspaceId}
                    parentId={currentFolder?.id ?? null}
                    parentName={currentFolder?.name ?? null}
                    roleNames={roleOptions.map((r) => r.name)}
                    canSetAccess={canManageRoles}
                  />
                ) : (
                  <p className="text-xs text-[color:var(--tide-deep)]/55">
                    Editors and above can add folders.
                  </p>
                )}
              </ChatSidebarSection>
            </div>

            {canInvite ? (
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

            <UrgencyChipSettings
              workspaceId={workspaceId}
              showBase={workspace.showUrgencyBase}
              showDate={workspace.showUrgencyDate}
              showTotal={workspace.showUrgencyTotal}
              canManage={canManageRoles}
            />

            <WorkspaceMembersPanel
              workspaceId={workspaceId}
              members={memberRows}
              viewerRole={membership.role}
              workspaceRoles={roleOptions}
            />
          </aside>

          <section className="space-y-6">
            <div className="tide-panel p-5">
              {backHref && backLabel ? (
                <Link
                  href={backHref}
                  className="text-sm text-[#0A3D45]/60 hover:underline"
                >
                  ← {backLabel}
                </Link>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
                  {currentFolder ? currentFolder.name : "All Tasks"}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {currentFolder ? (
                    <Link
                      href={`/app/w/${workspaceId}`}
                      className="tide-btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      See All Tasks
                    </Link>
                  ) : null}
                  {canEdit && currentFolder ? (
                    <FolderActions
                      {...folderActionsProps(currentFolder.id, currentFolder.name)}
                    />
                  ) : null}
                </div>
              </div>
              <p className="text-sm text-[#0A3D45]/60">
                {isRoot
                  ? "Every task in this workspace, grouped by status. Sort follows the urgency chips that are turned on."
                  : "Subfolders and tasks grouped by status. Sort follows the urgency chips that are turned on."}
              </p>

              {childFolders.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {childFolders.map((f) => (
                    <li key={f.id}>
                      <FolderBubble
                        workspaceId={workspaceId}
                        folderId={f.id}
                        name={f.name}
                        locked={f.locked}
                        restricted={f.requiredRoleIds.length > 0}
                        done={folderDoneCounts.get(f.id) ?? 0}
                        total={folderTotalCounts.get(f.id) ?? 0}
                        unclaimed={folderCounts.get(f.id) ?? 0}
                        showActions={canEdit && f.canAccess}
                        folderActions={folderActionsProps(f.id, f.name)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}

              {canEdit && currentFolder ? (
                <InlineActionForm
                  className="mt-5 grid gap-2 sm:grid-cols-2"
                  action={createTaskAction}
                  submitLabel="Add task"
                >
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="folderId" value={currentFolder.id} />
                  <input name="name" required placeholder="Task Name" className="tide-input" />
                  <PriorityField />
                  <input
                    name="description"
                    placeholder="Description"
                    className="tide-input sm:col-span-2"
                  />
                  <DueDateField name="dueDate" />
                  <div className="sm:col-span-2">
                    <TagSuggestInput
                      name="tags"
                      tags={publicTagOptions}
                      placeholder="add tags: example, test, help"
                      hint="Optional. Separate multiple tags with commas — same as Add Public Tag on a task."
                      emptyMessage="No public tags in this folder yet — type a new one"
                      allowMultiple
                      keepOpenOnPick
                    />
                  </div>
                </InlineActionForm>
              ) : null}

              {isRoot && canEdit ? (
                <p className="mt-4 text-sm text-[#0A3D45]/65">
                  Open a folder to add tasks. All Tasks lists everything by status.
                </p>
              ) : null}
            </div>

            <WorkspaceTaskList
              workspaceId={workspaceId}
              userId={user.id}
              canEdit={canEdit}
              isRoot={isRoot}
              tasks={tasks}
              publicTagOptions={publicTagOptions}
              privateTagOptions={privateTagOptions}
              urgencyChips={urgencyChips}
            />
          </section>
        </div>
      </main>
  );
}
