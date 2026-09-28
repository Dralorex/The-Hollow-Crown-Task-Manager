export function FolderCompletionStats({
  done,
  total,
  unclaimed,
}: {
  done: number;
  total: number;
  unclaimed: number;
}) {
  const pct = total === 0 ? 0 : Math.round((100 * done) / total);
  const label = total === 0 ? "No tasks" : `${pct}% Complete`;

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <span className="rounded-md bg-[color:var(--rowgon-deep)]/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--rowgon-deep)]/75">
          {label}
        </span>
        <span className="rounded-md bg-[color:var(--rowgon-deep)]/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--rowgon-deep)]/75">
          {done}/{total}
        </span>
        <span className="rounded-md bg-[color:var(--rowgon-deep)]/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--rowgon-deep)]/75">
          {unclaimed} Unclaimed
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--rowgon-deep)]/10">
        <div
          className="h-full rounded-full bg-[color:var(--rowgon-sea)] transition-[width] duration-300"
          style={{ width: `${total === 0 ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}
