import { AppLink } from "@/app/components/app-link";

/** Shown only when the workspace is over / past a hard limit. */
export function WorkspaceBillingOverLimitBanner({
  planName,
  memberCount,
  seatQuantity,
  reason,
}: {
  planName: string;
  memberCount: number;
  seatQuantity: number;
  reason: string;
}) {
  return (
    <div className="tide-panel border border-[#E85D4C]/35 p-4">
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[#0A3D45]">
        Over limit
      </h3>
      <p className="mt-1 text-sm text-[#0A3D45]/75">{reason}</p>
      <p className="mt-2 text-xs text-[#0A3D45]/55">
        {planName} · {memberCount}/{seatQuantity} seats
      </p>
      <AppLink
        href="/app/settings#manage-workspaces"
        className="tide-btn-primary mt-3 inline-flex text-sm"
        compactPending
      >
        Manage Workspaces
      </AppLink>
    </div>
  );
}
