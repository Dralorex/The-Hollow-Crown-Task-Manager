type BrandSize = "sm" | "md" | "lg" | "hero";

const MARK: Record<BrandSize, { px: number; className: string }> = {
  sm: { px: 22, className: "h-[22px] w-[22px]" },
  md: { px: 28, className: "h-7 w-7" },
  lg: { px: 36, className: "h-9 w-9" },
  hero: { px: 72, className: "h-14 w-14 sm:h-16 sm:w-16 md:h-[4.5rem] md:w-[4.5rem]" },
};

const TEXT: Record<BrandSize, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  hero: "text-6xl sm:text-7xl md:text-8xl leading-[0.95]",
};

/** Square Rowgon mark for inline use next to the wordmark. */
export function BrandMark({
  size = "md",
  className = "",
}: {
  size?: BrandSize;
  className?: string;
}) {
  const { px, className: sizeClass } = MARK[size];
  return (
    <img
      src="/brand/rowgon-mark.png"
      alt=""
      width={px}
      height={px}
      decoding="async"
      className={`shrink-0 rounded-[22%] object-cover ${sizeClass} ${className}`}
    />
  );
}

/** Mark + “Rowgon” lockup used in nav, auth, and landing. */
export function BrandLockup({
  size = "md",
  className = "",
  markClassName = "",
  textClassName = "",
}: {
  size?: BrandSize;
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  const gap = size === "hero" ? "gap-3 sm:gap-4" : "gap-2";
  return (
    <span
      className={`inline-flex items-center ${gap} font-[family-name:var(--font-display)] tracking-tight ${TEXT[size]} ${className}`}
    >
      <BrandMark size={size} className={markClassName} />
      <span className={textClassName}>Rowgon</span>
    </span>
  );
}
