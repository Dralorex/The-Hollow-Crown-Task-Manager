"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type Align = "left" | "right";

function viewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

/**
 * Renders a dropdown into document.body with fixed positioning so it isn’t
 * clipped by overflow:hidden ancestors and stays above other UI layers.
 *
 * Frosted blur lives on an *inner* node — putting backdrop-filter on the
 * fixed shell breaks top/left placement on mobile WebKit.
 */
export function MenuSurface({
  open,
  onClose,
  align = "right",
  widthClass = "min-w-[10rem]",
  children,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  align?: Align;
  widthClass?: string;
  children: ReactNode;
  trigger: (opts: {
    ref: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const place = useCallback(() => {
    const btn = buttonRef.current;
    const panel = panelRef.current;
    if (!btn || !panel) return;
    const rect = btn.getBoundingClientRect();
    const vp = viewportSize();
    const margin = 8;
    const gap = 4;

    // Cap width to the phone viewport so w-72 can’t overflow.
    const maxWidth = Math.max(160, vp.width - margin * 2);
    panel.style.maxWidth = `${maxWidth}px`;

    const panelWidth = Math.min(panel.offsetWidth || 160, maxWidth);
    const panelHeight = panel.offsetHeight || 0;

    let left =
      align === "right" ? rect.right - panelWidth : rect.left;
    left = Math.max(
      margin + vp.offsetLeft,
      Math.min(left, vp.offsetLeft + vp.width - panelWidth - margin),
    );

    const spaceBelow = vp.offsetTop + vp.height - rect.bottom - gap - margin;
    const spaceAbove = rect.top - vp.offsetTop - gap - margin;
    let top = rect.bottom + gap;
    if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
      top = rect.top - panelHeight - gap;
    }
    // Keep the panel inside the visible viewport (keyboard / URL bar safe).
    const minTop = vp.offsetTop + margin;
    const maxTop = vp.offsetTop + vp.height - margin - Math.min(panelHeight, vp.height - margin * 2);
    top = Math.max(minTop, Math.min(top, maxTop));

    // Tall edit forms: scroll inside the menu instead of spilling off-screen.
    const maxHeight = vp.height - margin * 2;
    panel.style.maxHeight = `${maxHeight}px`;

    setCoords({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    place();
    // Second pass after layout (fonts / form fields) settles.
    const raf = requestAnimationFrame(() => place());
    const onReposition = () => place();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onReposition);
    vv?.addEventListener("scroll", onReposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      vv?.removeEventListener("resize", onReposition);
      vv?.removeEventListener("scroll", onReposition);
    };
  }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {trigger({ ref: buttonRef })}
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className={`fixed z-[200] overflow-y-auto overscroll-contain ${widthClass}`}
              style={{
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                visibility: coords ? "visible" : "hidden",
              }}
            >
              <div className="rowgon-menu-popover rounded-lg py-1">
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function menuItemClass(danger = false) {
  return danger
    ? "block w-full px-3 py-2 text-left text-sm text-[color:var(--rowgon-coral)] hover:bg-[color:var(--rowgon-coral)]/10"
    : "block w-full px-3 py-2 text-left text-sm text-[color:var(--rowgon-deep)] hover:bg-[color:var(--rowgon-deep)]/8";
}
