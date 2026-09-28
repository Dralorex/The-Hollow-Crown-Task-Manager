"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewTaskAction } from "@/app/actions/tasks";

export function SendBackTaskControl({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("taskId", taskId);
      fd.set("decision", "reopen");
      fd.set("reason", reason.trim());
      const result = await reviewTaskAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="rowgon-btn-secondary text-xs"
        onClick={() => setOpen(true)}
      >
        Send back
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-2 rounded-md border border-[#0A3D45]/12 bg-[#0A3D45]/[0.03] p-3"
    >
      <label className="block text-xs font-medium text-[#0A3D45]">
        Why are you sending this back?
        <input
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rowgon-input mt-1 w-full text-sm"
          placeholder="Missing details / needs revision / etc."
        />
      </label>
      {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="text-xs text-[#0A3D45]/60"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rowgon-btn-secondary text-xs disabled:opacity-60"
        >
          {pending ? "Working…" : "Confirm send back"}
        </button>
      </div>
    </form>
  );
}
