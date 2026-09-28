import Link from "next/link";

export function WorkspacePulseStrip({
  workspaceId,
  counts,
  canReview,
  inbox,
  myClaimedCount,
  needsReviewCount,
}: {
  workspaceId: string;
  counts: {
    open: number;
    claimed: number;
    inReview: number;
    overdue: number;
    done: number;
  } | null;
  canReview: boolean;
  inbox: "mine" | "review" | null;
  myClaimedCount: number;
  needsReviewCount: number;
}) {
  const base = `/app/w/${workspaceId}`;
  const tab = (
    href: string,
    active: boolean,
    label: string,
    count?: number,
  ) => (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center justify-center rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-[#0A3D45] text-[#E8F7F6]"
          : "bg-white/50 text-[#0A3D45]/75 hover:bg-white/80"
      }`}
    >
      {label}
      {typeof count === "number" ? (
        <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
      ) : null}
    </Link>
  );

  return (
    <div className="mt-6 space-y-3">
      {counts ? (
        <div className="rowgon-panel flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
          <h2 className="shrink-0 font-[family-name:var(--font-display)] text-base text-[#0A3D45] sm:text-lg">
            Pulse
          </h2>
          <dl className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
            {(
              [
                ["Open", counts.open],
                ["Claimed", counts.claimed],
                ["Review", counts.inReview],
                ["Overdue", counts.overdue],
                ["Done", counts.done],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0A3D45]/6 px-2.5 py-1"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/55">
                  {label}
                </dt>
                <dd className="text-sm font-semibold tabular-nums text-[#0A3D45]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {canReview && counts.inReview > 0 ? (
            <Link
              href={`${base}?inbox=review`}
              className="shrink-0 text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
            >
              Review · {counts.inReview}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tab(base, inbox === null, "Folders")}
        {tab(`${base}?inbox=mine`, inbox === "mine", "My claimed", myClaimedCount)}
        {canReview
          ? tab(
              `${base}?inbox=review`,
              inbox === "review",
              "Needs review",
              needsReviewCount,
            )
          : null}
      </div>
    </div>
  );
}
