"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAccountDeletionAction,
  requestAccountDeletionAction,
} from "@/app/actions/account";

export function DeleteAccountPanel() {
  const [open, setOpen] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function requestCode() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction(null, new FormData());
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setCodeSent(true);
      setEmail(result && result.ok ? (result.email ?? null) : null);
      setInfo("Check your inbox — and your spam folder — for the 6-digit code.");
    });
  }

  function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("code", code.trim());
      const result = await confirmAccountDeletionAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-[#9b2f22]/25 bg-[#9b2f22]/5 p-5">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[#9b2f22]">
        Delete account
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#0A3D45]/75">
        This removes you from workspaces and friend lists, unclaims your tasks with
        reason “account deleted”, and frees your username. Chat history stays for
        safety, labeled <em>*deleted account*</em>, until someone removes those chats.
      </p>

      {!open ? (
        <button
          type="button"
          className="mt-4 rounded-md bg-[#9b2f22] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setOpen(true)}
        >
          Delete my account…
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-[#0A3D45]">
            Are you sure? We’ll email a 6-digit code to confirm.
          </p>
          {!codeSent ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-[#9b2f22] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={requestCode}
              >
                {pending ? "Sending…" : "Send confirmation code"}
              </button>
              <button
                type="button"
                className="text-sm text-[#0A3D45]/65 underline-offset-2 hover:underline"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={confirmDelete}>
              {email ? (
                <p className="text-xs text-[#0A3D45]/65">
                  Code sent to <strong>{email}</strong>. Check spam if you don’t see
                  it.
                </p>
              ) : null}
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="tide-input tracking-[0.3em] text-center text-lg"
                placeholder="••••••"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending || code.length !== 6}
                  className="rounded-md bg-[#9b2f22] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pending ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  className="text-sm text-[#0A3D45]/65 underline-offset-2 hover:underline"
                  onClick={requestCode}
                  disabled={pending}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
          {error ? <p className="text-sm text-[#9b2f22]">{error}</p> : null}
          {info ? <p className="text-sm text-[#0A3D45]/70">{info}</p> : null}
        </div>
      )}
    </div>
  );
}
