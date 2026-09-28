"use client";

import { format } from "date-fns";
import { InlineActionForm } from "@/app/components/forms";
import {
  sendWeeklyDigestNowAction,
  setWeeklyDigestEnabledAction,
} from "@/app/actions/digest";
import type { WeeklyDigestPayload } from "@/lib/weekly-digest";

export function WeeklyDigestPanel({
  enabled,
  lastSentAt,
  hasEmail,
  preview,
}: {
  enabled: boolean;
  lastSentAt: string | null;
  hasEmail: boolean;
  preview: WeeklyDigestPayload;
}) {
  const counts = [
    ["Overdue", preview.overdue.length],
    ["Due soon", preview.dueSoon.length],
    ["Review", preview.inReview.length],
    ["On your plate", preview.claimedOpen.length],
  ] as const;

  return (
    <section className="tide-panel mt-8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
            Weekly digest
          </h2>
          <p className="mt-1 text-sm text-[#0A3D45]/65">
            Email summary for {preview.weekLabel} — overdue, due soon, reviews,
            and claimed work.
          </p>
        </div>
        <InlineActionForm
          action={setWeeklyDigestEnabledAction}
          submitLabel={enabled ? "On" : "Off"}
          submitClassName="!min-h-9 !px-3 text-xs"
          className="flex items-center"
        >
          <input
            type="hidden"
            name="enabled"
            value={enabled ? "false" : "true"}
          />
        </InlineActionForm>
      </div>

      <dl className="mt-4 flex flex-wrap gap-2">
        {counts.map(([label, value]) => (
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

      {!hasEmail ? (
        <p className="mt-3 text-sm text-[#9b2f22]">
          Add an email on your account to receive digests.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <InlineActionForm
            action={sendWeeklyDigestNowAction}
            submitLabel="Send preview now"
            submitVariant="primary"
            submitClassName="min-h-10 text-sm"
          >
            <span className="sr-only">Send</span>
          </InlineActionForm>
          {lastSentAt ? (
            <p className="text-xs text-[#0A3D45]/50">
              Last sent {format(new Date(lastSentAt), "MMM d · h:mm a")}
            </p>
          ) : (
            <p className="text-xs text-[#0A3D45]/50">
              Without RESEND_API_KEY, preview logs to the server console.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
