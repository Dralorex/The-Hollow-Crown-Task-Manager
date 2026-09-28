"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActivePolling } from "@/lib/use-active-polling";

/**
 * Polls /api/pulse and refreshes the RSC tree when notifications, chat,
 * workspace tasks/folders, or the viewer's membership roles change.
 * Pauses while the tab is hidden or the user has been idle.
 */
export function LiveRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  const stampRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const active = useActivePolling();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch("/api/pulse", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { ok?: boolean; stamp?: string };
        if (!data.ok || !data.stamp || cancelled) return;

        if (!readyRef.current) {
          stampRef.current = data.stamp;
          readyRef.current = true;
          return;
        }

        if (stampRef.current !== data.stamp) {
          stampRef.current = data.stamp;
          router.refresh();
        }
      } catch {
        /* ignore transient network errors */
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, intervalMs);
        }
      }
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, intervalMs, router]);

  return null;
}
