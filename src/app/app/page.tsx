import { redirect } from "next/navigation";
import { StartHereNewWorkspace } from "@/app/components/start-here-new-workspace";
import { WorkspaceCardMenu } from "@/app/components/workspace-card-menu";
import { canViewArchived, isArchived } from "@/lib/archive";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function AppHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "desc" },
  });

  const visible = memberships.filter((m) =>
    canViewArchived(user.id, m.role, m.workspace),
  );
  const active = visible.filter((m) => !isArchived(m.workspace));
  const archived = visible.filter((m) => isArchived(m.workspace));

  const workspaceIds = active.map((m) => m.workspaceId);
  const allMembers =
    workspaceIds.length > 0
      ? await prisma.membership.findMany({
          where: { workspaceId: { in: workspaceIds } },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const membersByWorkspace = new Map<
    string,
    {
      userId: string;
      role: string;
      username: string;
      nickname: string | null;
    }[]
  >();
  for (const m of allMembers) {
    const list = membersByWorkspace.get(m.workspaceId) ?? [];
    list.push({
      userId: m.userId,
      role: m.role,
      username: m.user.username,
      nickname: m.user.nickname,
    });
    membersByWorkspace.set(m.workspaceId, list);
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      read: false,
      type: { notIn: ["CHAT_MESSAGE", "DM_REQUEST"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const showStartHere = active.length === 0 && archived.length === 0;

  const workspaceList =
    active.length === 0 ? (
      <div className="rowgon-panel sm:col-span-2 lg:col-span-3 max-w-xl p-5 text-sm text-[#0A3D45]/70">
        No active workspaces. Archived ones are listed below if you still have
        access.
      </div>
    ) : (
      active.map((m, i) => {
        const isOwner = m.role === "OWNER";
        return (
          <div
            key={m.id}
            className="rowgon-panel relative p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/app/w/${m.workspaceId}`}
                className="min-w-0 flex-1"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
                    {m.workspace.name}
                  </p>
                  {isOwner ? (
                    <span className="rounded-md bg-[#0A3D45]/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0A3D45]">
                      Owner
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm capitalize text-[#0A3D45]/60">
                  {m.role.toLowerCase()}
                </p>
              </Link>
              <WorkspaceCardMenu
                workspaceId={m.workspaceId}
                workspaceName={m.workspace.name}
                role={m.role}
                members={membersByWorkspace.get(m.workspaceId) ?? []}
              />
            </div>
          </div>
        );
      })
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <StartHereNewWorkspace
        showStartHere={showStartHere}
        workspaceList={workspaceList}
      />

      {archived.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
            Archived
          </h2>
          <p className="mt-1 text-sm text-[#0A3D45]/60">
            Soft-deleted workspaces. History is kept; Admin+ can restore.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((m) => (
              <Link
                key={m.id}
                href={`/app/w/${m.workspaceId}`}
                className="rowgon-panel block border border-[#0A3D45]/10 bg-white/50 p-5 opacity-90 transition hover:opacity-100"
              >
                <p className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
                  {m.workspace.name}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-[#0A3D45]/50">
                  Archived · {m.role.toLowerCase()}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {notifications.length > 0 ? (
        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
              Incoming
            </h2>
            <Link
              href="/app/notifications"
              className="text-sm font-semibold text-[#0A3D45] underline-offset-2 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="rowgon-panel px-4 py-3 text-sm">
                <Link href="/app/notifications" className="block">
                  <span className="font-semibold text-[#0A3D45]">{n.title}</span>
                  <span className="text-[#0A3D45]/70"> — {n.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
