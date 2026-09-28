"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unclaimTaskAction } from "@/app/actions/tasks";

export function UnclaimTaskControl({
  workspaceId,
  taskId,
}: {
  workspaceId: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [workNote, setWorkNote] = useState("");
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
      fd.set("reason", reason.trim());
      fd.set("workNote", workNote.trim());
      const result = await unclaimTaskAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      setWorkNote("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs font-semibold text-[#0A3D45]/65 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Unclaim
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 w-full max-w-sm space-y-2 rounded-md border border-[#0A3D45]/12 bg-[#0A3D45]/[0.03] p-3"
    >
      <label className="block text-xs font-medium text-[#0A3D45]">
        Why are you unclaiming?
        <input
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rowgon-input mt-1 w-full text-sm"
          placeholder="Need to step away / blocked / etc."
        />
      </label>
      <label className="block text-xs font-medium text-[#0A3D45]">
        What did you do / any changes?
        <textarea
          value={workNote}
          onChange={(e) => setWorkNote(e.target.value)}
          className="rowgon-input mt-1 min-h-[4rem] w-full text-sm"
          placeholder="Progress notes for the next person…"
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
          {pending ? "Working…" : "Confirm unclaim"}
        </button>
      </div>
    </form>
  );
}
