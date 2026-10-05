import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DisplayThemeSettings } from "@/app/components/display-theme-settings";
import { InterfaceSettings } from "@/app/components/interface-settings";
import { ManageWorkspacesBilling } from "@/app/components/manage-workspaces-billing";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePersonalInterfacePrefs } from "@/lib/interface-prefs";
import {
  THEME_COOKIE,
  LEGACY_THEME_COOKIE,
  THEME_MIGRATION_COOKIE,
  parseDisplayTheme,
} from "@/lib/theme";
import { AppLink } from "@/app/components/app-link";
import { PLANS, type PlanId } from "@/lib/plans";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    billing?: string;
    workspaceId?: string;
    session_id?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const cookieStore = await cookies();
  const theme = parseDisplayTheme(
    cookieStore.get(THEME_COOKIE)?.value ??
      cookieStore.get(LEGACY_THEME_COOKIE)?.value,
    { migratedV2: cookieStore.get(THEME_MIGRATION_COOKIE)?.value === "1" },
  );

  const prefsRow = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      interfacePrefsJson: true,
      showInterfaceTogglesInWorkspace: true,
    },
  });

  let billingFlash: string | null = null;
  if (sp.billing === "success" && sp.session_id && sp.workspaceId) {
    const { reconcileCheckoutSession } = await import("@/lib/billing-sync");
    const reconciled = await reconcileCheckoutSession({
      sessionId: sp.session_id,
      workspaceId: sp.workspaceId,
    });
    billingFlash = reconciled.ok
      ? `Plan updated: ${reconciled.plan}. Manage seats anytime here.`
      : `Payment received, but plan sync needs a refresh: ${reconciled.error}`;
  } else if (sp.billing === "cancel") {
    billingFlash = "Checkout canceled — no plan change.";
  }

  const ownedMemberships = await prisma.membership.findMany({
    where: { userId: user.id, role: "OWNER" },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          billing: true,
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const manageRows = ownedMemberships.map((m) => {
    const plan = (m.workspace.billing?.plan ?? "FREE") as PlanId;
    return {
      id: m.workspace.id,
      name: m.workspace.name,
      plan,
      planName: PLANS[plan].name,
      memberCount: m.workspace._count.memberships,
      seatQuantity: m.workspace.billing?.seatQuantity ?? 5,
      status: m.workspace.billing?.status ?? "ACTIVE",
      autoCloseUnusedSeats: m.workspace.billing?.autoCloseUnusedSeats ?? true,
      autoAddSeats: m.workspace.billing?.autoAddSeats ?? false,
      isOwner: true,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--tide-deep)]">
        Settings
      </h1>
      <p className="mt-2 text-sm text-[color:var(--tide-deep)]/65">
        App preferences for this device and account. Profile details stay under{" "}
        <AppLink
          href="/app/profile"
          className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
          compactPending
        >
          Profile
        </AppLink>
        .
      </p>

      <div className="mt-8 space-y-4">
        <details
          id="manage-workspaces"
          className="tide-panel p-5"
          open={Boolean(sp.billing || sp.workspaceId)}
        >
          <summary className="cursor-pointer font-semibold text-[color:var(--tide-deep)]">
            Manage Workspaces
          </summary>
          <div className="mt-4">
            <ManageWorkspacesBilling
              workspaces={manageRows}
              initialWorkspaceId={sp.workspaceId}
              billingFlash={billingFlash}
            />
          </div>
        </details>

        <InterfaceSettings
          prefs={parsePersonalInterfacePrefs(prefsRow.interfacePrefsJson)}
          showTogglesInWorkspace={prefsRow.showInterfaceTogglesInWorkspace}
        />

        <details className="tide-panel p-5">
          <summary className="cursor-pointer font-semibold text-[color:var(--tide-deep)]">
            Display
          </summary>
          <div className="mt-4">
            <DisplayThemeSettings currentTheme={theme} />
          </div>
        </details>
      </div>
    </main>
  );
}
