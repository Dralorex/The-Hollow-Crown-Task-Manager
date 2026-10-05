"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startWorkspaceCheckoutAction,
  createBillingPortalSessionAction,
  updateWorkspaceBillingPrefsAction,
} from "@/app/actions/billing";
import {
  PLAN_COMPARE_ROWS,
  PLANS,
  SEAT_PACKAGES,
  formatUsdFromCents,
  planMaxSeatsOrCap,
  seatPortionCents,
  totalPeriodCents,
  type PlanId,
} from "@/lib/plans";

export type ManageWorkspaceRow = {
  id: string;
  name: string;
  plan: PlanId;
  planName: string;
  memberCount: number;
  seatQuantity: number;
  status: string;
  autoCloseUnusedSeats: boolean;
  autoAddSeats: boolean;
  isOwner: boolean;
};

type PaidPlan = Exclude<PlanId, "FREE">;

const PAID_PLANS: PaidPlan[] = ["TEAM", "BUSINESS", "ENTERPRISE"];

export function ManageWorkspacesBilling({
  workspaces,
  initialWorkspaceId,
  billingFlash,
}: {
  workspaces: ManageWorkspaceRow[];
  initialWorkspaceId?: string | null;
  billingFlash?: string | null;
}) {
  const router = useRouter();
  const owned = workspaces.filter((w) => w.isOwner);
  const [workspaceId, setWorkspaceId] = useState(
    initialWorkspaceId && owned.some((w) => w.id === initialWorkspaceId)
      ? initialWorkspaceId
      : (owned[0]?.id ?? ""),
  );
  const workspace = owned.find((w) => w.id === workspaceId) ?? null;

  const [selectedPlan, setSelectedPlan] = useState<PaidPlan | null>(null);
  const [seatMode, setSeatMode] = useState<"package" | "custom" | "max">(
    "package",
  );
  const [packageSeats, setPackageSeats] = useState<number | null>(null);
  const [customSeats, setCustomSeats] = useState("");
  const [autoClose, setAutoClose] = useState(true);
  const [autoAdd, setAutoAdd] = useState(false);
  const [showAutoClosePrompt, setShowAutoClosePrompt] = useState(false);
  const [showAutoAddPrompt, setShowAutoAddPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolvedSeats = useMemo(() => {
    if (!selectedPlan || !workspace) return 5;
    const min = Math.max(workspace.memberCount, 5);
    const max = planMaxSeatsOrCap(selectedPlan);
    let n = min;
    if (seatMode === "max") n = max;
    else if (seatMode === "custom") {
      const parsed = Number.parseInt(customSeats, 10);
      n = Number.isFinite(parsed) ? parsed : min;
    } else if (packageSeats != null) n = packageSeats;
    return Math.min(max, Math.max(min, n));
  }, [selectedPlan, workspace, seatMode, packageSeats, customSeats]);

  function pickPlan(plan: PaidPlan) {
    setSelectedPlan(plan);
    setSeatMode("package");
    setPackageSeats(null);
    setCustomSeats("");
    setAutoClose(true);
    setAutoAdd(workspace?.autoAddSeats ?? false);
    setError(null);
  }

  function pickPackage(n: number) {
    setSeatMode("package");
    setPackageSeats(n);
    // Selecting a seat package turns off auto-close by default + offer prompt.
    if (autoClose) {
      setAutoClose(false);
      setShowAutoClosePrompt(true);
    }
  }

  function pickMax() {
    setSeatMode("max");
    setPackageSeats(null);
    if (autoClose) {
      setAutoClose(false);
      setShowAutoClosePrompt(true);
    }
  }

  function onCustomFocus() {
    setSeatMode("custom");
    if (autoClose) {
      setAutoClose(false);
      setShowAutoClosePrompt(true);
    }
  }

  function checkout() {
    if (!workspace || !selectedPlan) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspace.id);
      fd.set("plan", selectedPlan);
      fd.set("interval", "MONTHLY");
      fd.set("seats", String(resolvedSeats));
      fd.set("autoCloseUnusedSeats", autoClose ? "true" : "false");
      fd.set("autoAddSeats", autoAdd ? "true" : "false");
      const result = await startWorkspaceCheckoutAction(null, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
      else router.refresh();
    });
  }

  function savePrefs() {
    if (!workspace) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspace.id);
      fd.set("autoCloseUnusedSeats", autoClose ? "true" : "false");
      fd.set("autoAddSeats", autoAdd ? "true" : "false");
      const result = await updateWorkspaceBillingPrefsAction(null, fd);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function openPortal() {
    if (!workspace) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspace.id);
      const result = await createBillingPortalSessionAction(null, fd);
      if (!result.ok) setError(result.error);
      else if (result.url) window.location.href = result.url;
    });
  }

  if (owned.length === 0) {
    return (
      <p className="text-sm text-[color:var(--tide-deep)]/70">
        You don’t own any workspaces yet. Create one from the home page — your
        first Free slot is included.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {billingFlash ? (
        <p
          className="rounded-md bg-[color:var(--tide-deep)]/8 px-3 py-2 text-sm text-[color:var(--tide-deep)]"
          role="status"
        >
          {billingFlash}
        </p>
      ) : null}

      <p className="text-sm text-[color:var(--tide-deep)]/70">
        Rowgon is free for personal use. Upgrade a workspace when your team
        needs more seats and admin tools — not to unlock the basics.
      </p>

      <label className="block text-sm font-medium text-[color:var(--tide-deep)]">
        Workspace
        <select
          className="tide-input mt-1 w-full"
          value={workspaceId}
          onChange={(e) => {
            setWorkspaceId(e.target.value);
            setSelectedPlan(null);
            setError(null);
          }}
        >
          {owned.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · {w.planName} · {w.memberCount}/{w.seatQuantity} seats
            </option>
          ))}
        </select>
      </label>

      {workspace ? (
        <dl className="grid grid-cols-2 gap-2 text-sm text-[color:var(--tide-deep)]/85">
          <div>
            <dt className="opacity-60">Current plan</dt>
            <dd className="font-medium">{workspace.planName}</dd>
          </div>
          <div>
            <dt className="opacity-60">Status</dt>
            <dd className="font-medium">{workspace.status}</dd>
          </div>
        </dl>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[color:var(--tide-deep)]/15 text-[color:var(--tide-deep)]">
              <th className="py-2 pr-2 font-semibold">Compare</th>
              <th className="py-2 px-2 font-semibold">Free</th>
              <th className="py-2 px-2 font-semibold">Team</th>
              <th className="py-2 px-2 font-semibold">Business</th>
              <th className="py-2 px-2 font-semibold">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARE_ROWS.map((row) => (
              <tr
                key={row.label}
                className="border-b border-[color:var(--tide-deep)]/10 text-[color:var(--tide-deep)]/80"
              >
                <td className="py-2 pr-2 font-medium">{row.label}</td>
                <td className="py-2 px-2">{row.free}</td>
                <td className="py-2 px-2">{row.team}</td>
                <td className="py-2 px-2">{row.business}</td>
                <td className="py-2 px-2">{row.enterprise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {PAID_PLANS.map((plan) => (
          <button
            key={plan}
            type="button"
            disabled={pending || !workspace}
            onClick={() => pickPlan(plan)}
            className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
              selectedPlan === plan
                ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)]/8"
                : "border-[color:var(--tide-deep)]/20 hover:border-[color:var(--tide-deep)]/40"
            }`}
          >
            <div className="font-[family-name:var(--font-display)] text-lg text-[color:var(--tide-deep)]">
              {PLANS[plan].name}
            </div>
            <div className="mt-1 text-[color:var(--tide-deep)]/70">
              {formatUsdFromCents(PLANS[plan].baseMonthlyCents)}/mo base
            </div>
          </button>
        ))}
      </div>

      {selectedPlan && workspace ? (
        <div className="space-y-4 rounded-lg border border-[color:var(--tide-deep)]/15 p-4">
          <h4 className="font-semibold text-[color:var(--tide-deep)]">
            Seats for {PLANS[selectedPlan].name}
          </h4>
          <p className="text-xs text-[color:var(--tide-deep)]/60">
            Packages between membership sizes. You need at least{" "}
            {Math.max(workspace.memberCount, 5)} for this workspace.
          </p>
          <div className="flex flex-wrap gap-2">
            {SEAT_PACKAGES[selectedPlan].presets.map((n) => (
              <button
                key={n}
                type="button"
                disabled={pending || n < workspace.memberCount}
                onClick={() => pickPackage(n)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  seatMode === "package" && packageSeats === n
                    ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)] text-[color:var(--tide-foam,#E8F7F6)]"
                    : "border-[color:var(--tide-deep)]/25"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={pickMax}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                seatMode === "max"
                  ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)] text-[color:var(--tide-foam,#E8F7F6)]"
                  : "border-[color:var(--tide-deep)]/25"
              }`}
            >
              {SEAT_PACKAGES[selectedPlan].maxLabel}
            </button>
          </div>
          <label className="block text-sm text-[color:var(--tide-deep)]">
            Custom seats
            <input
              type="number"
              min={Math.max(workspace.memberCount, 5)}
              max={planMaxSeatsOrCap(selectedPlan)}
              className="tide-input mt-1 w-full max-w-[12rem]"
              value={customSeats}
              onFocus={onCustomFocus}
              onChange={(e) => {
                setSeatMode("custom");
                setCustomSeats(e.target.value);
              }}
              placeholder="Exact number"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-[color:var(--tide-deep)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoClose}
              onChange={(e) => setAutoClose(e.target.checked)}
            />
            <span>
              Auto-close unused seats each month (stop paying for empty seats at
              renewal). On by default unless you pick a seat package.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-[color:var(--tide-deep)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={autoAdd}
              onChange={(e) => {
                if (e.target.checked) setShowAutoAddPrompt(true);
                else setAutoAdd(false);
              }}
            />
            <span>Auto-add seats when a new member would go over the limit</span>
          </label>

          <p className="text-sm text-[color:var(--tide-deep)]/80">
            Estimated total:{" "}
            <strong>
              {formatUsdFromCents(
                totalPeriodCents(selectedPlan, resolvedSeats, "MONTHLY"),
              )}
              /mo
            </strong>{" "}
            for {resolvedSeats} seats (seat portion{" "}
            {formatUsdFromCents(seatPortionCents(resolvedSeats))}/mo).
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={checkout}
              className="tide-btn-primary text-sm"
            >
              Continue to Checkout
            </button>
            {workspace.plan !== "FREE" ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={savePrefs}
                  className="tide-btn-secondary text-sm"
                >
                  Save seat preferences
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={openPortal}
                  className="text-sm underline text-[color:var(--tide-deep)]/70"
                >
                  Manage payment method
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[#E85D4C]" role="alert">
          {error}
        </p>
      ) : null}

      {showAutoClosePrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="tide-panel max-w-md p-5 shadow-lg">
            <h4 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--tide-deep)]">
              Auto seat removal?
            </h4>
            <p className="mt-2 text-sm text-[color:var(--tide-deep)]/80">
              Do you want to turn on auto seat removal that will stop paying for
              unused seats each month?
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="tide-btn-primary text-sm"
                onClick={() => {
                  setAutoClose(true);
                  setShowAutoClosePrompt(false);
                }}
              >
                Yes, auto-remove unused
              </button>
              <button
                type="button"
                className="tide-btn-secondary text-sm"
                onClick={() => {
                  setAutoClose(false);
                  setShowAutoClosePrompt(false);
                }}
              >
                No, keep my package
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAutoAddPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="tide-panel max-w-md p-5 shadow-lg">
            <h4 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--tide-deep)]">
              Auto-add seats?
            </h4>
            <p className="mt-2 text-sm text-[color:var(--tide-deep)]/80">
              When someone joins over your seat max, we’ll add a seat
              automatically.{" "}
              <strong>
                Added seats are charged for the time left in the pay period, not
                the full month’s charge.
              </strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="tide-btn-primary text-sm"
                onClick={() => {
                  setAutoAdd(true);
                  setShowAutoAddPrompt(false);
                }}
              >
                Enable auto-add
              </button>
              <button
                type="button"
                className="tide-btn-secondary text-sm"
                onClick={() => {
                  setAutoAdd(false);
                  setShowAutoAddPrompt(false);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
