/** Lightweight skeleton shown while an /app route streams in. */
export function AppRouteLoading({
  label = "Loading",
  embedded = false,
}: {
  label?: string;
  /** Use a div instead of main when nested inside another page shell. */
  embedded?: boolean;
}) {
  const Tag = embedded ? "div" : "main";
  return (
    <Tag
      className={
        embedded ? "py-2" : "mx-auto max-w-6xl px-4 py-8"
      }
      aria-busy="true"
      aria-label={label}
    >
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[color:var(--tide-deep)]/10" />
      <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-[color:var(--tide-deep)]/8" />
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`chip-${i}`}
            className="h-8 w-24 animate-pulse rounded-full bg-[color:var(--tide-deep)]/8"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="tide-panel h-36 animate-pulse bg-[color:var(--tide-deep)]/[0.04]"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </Tag>
  );
}

