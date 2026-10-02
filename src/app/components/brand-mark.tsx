type BrandSize = "sm" | "md" | "lg" | "hero";

/** Height-driven sizes for the official horizontal wordmark (≈3.22∶1). */
const LOGO: Record<
  BrandSize,
  { height: number; width: number; className: string; src: string }
> = {
  sm: {
    height: 26,
    width: 84,
    className: "h-[26px] w-auto",
    src: "/brand/rowgon-logo.png",
  },
  md: {
    height: 32,
    width: 103,
    className: "h-8 w-auto",
    src: "/brand/rowgon-logo.png",
  },
  lg: {
    height: 40,
    width: 129,
    className: "h-10 w-auto",
    src: "/brand/rowgon-logo.png",
  },
  hero: {
    height: 88,
    width: 283,
    className: "h-16 w-auto sm:h-20 md:h-[5.5rem]",
    src: "/brand/rowgon-logo-hero.png",
  },
};

/** Official Rowgon logo (mark + wordmark) for site chrome — not the app icon. */
export function BrandLockup({
  size = "md",
  className = "",
}: {
  size?: BrandSize;
  className?: string;
}) {
  const { height, width, className: sizeClass, src } = LOGO[size];
  return (
    <img
      src={src}
      alt="Rowgon"
      width={width}
      height={height}
      decoding="async"
      className={`block shrink-0 object-contain object-left ${sizeClass} ${className}`}
    />
  );
}
