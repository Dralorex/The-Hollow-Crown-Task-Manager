"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/auth";
import { EmailField } from "@/app/components/email-field";
import { EmailVerifyModal } from "@/app/components/email-verify-modal";
import { PasswordFields } from "@/app/components/password-fields";
import { SignInDurationFields } from "@/app/components/sign-in-duration-fields";
import { UsernameField } from "@/app/components/username-field";

type FormAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult | null>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rowgon-btn-primary disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function SignUpForm({
  action,
  next,
}: {
  action: FormAction;
  next?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);
  const [email, setEmail] = useState("");
  const [acked, setAcked] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [pendingSignupId, setPendingSignupId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && state.ok && state.needsEmailVerification && state.email) {
      setVerifyEmail(state.email);
      setPendingSignupId(state.pendingSignupId ?? null);
    }
  }, [state]);

  function trySubmit(e: React.FormEvent<HTMLFormElement>) {
    const hasEmail = email.trim().length > 0;
    if (!hasEmail && !acked) {
      e.preventDefault();
      setShowWarning(true);
    }
  }

  function confirmWithoutEmail() {
    if (!acked) return;
    setShowWarning(false);
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  return (
    <>
      <form
        ref={formRef}
        className="flex w-full flex-col gap-4"
        action={formAction}
        onSubmit={trySubmit}
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {acked ? <input type="hidden" name="noEmailAck" value="true" /> : null}

        <UsernameField placeholder="rowgon_rider" />
        <label className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]">
          Nickname{" "}
          <span className="font-normal text-[#0A3D45]/55">(optional)</span>
          <input
            name="nickname"
            autoComplete="nickname"
            className="rowgon-input"
            placeholder="Display name"
            maxLength={40}
          />
        </label>
        <p className="text-xs leading-relaxed text-[#0A3D45]/60">
          Shown instead of your username around the app. You can change it later in
          profile settings.
        </p>
        <PasswordFields />
        <EmailField
          name="email"
          value={email}
          placeholder="you@example.com"
          hint="Add an email to verify with a 4-digit code and enable password resets. Tap @gmail then .com for a quick fill."
          onChange={(next) => {
            setEmail(next);
            if (next.trim()) {
              setAcked(false);
              setShowWarning(false);
            }
          }}
        />

        <SignInDurationFields />

        {state && !state.ok ? (
          <p className="rounded-lg bg-[#E85D4C]/12 px-3 py-2 text-sm text-[#9b2f22]">
            {state.error}
          </p>
        ) : null}

        <SubmitButton label="Create account" />
      </form>

      {showWarning ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A3D45]/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-email-warning-title"
        >
          <div className="rowgon-panel w-full max-w-md p-6 shadow-lg">
            <h2
              id="no-email-warning-title"
              className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]"
            >
              Continue without email?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#0A3D45]/80">
              Without an email connected to your account, you won’t be able to reset
              your password if you forget it and your chosen username will never be
              available again.
            </p>
            <label className="mt-5 flex items-start gap-3 text-sm text-[#0A3D45]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[#0A3D45]"
                checked={acked}
                onChange={(e) => setAcked(e.target.checked)}
              />
              <span>I understand and agree to the consequences</span>
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rowgon-btn-secondary text-sm"
                onClick={() => {
                  setShowWarning(false);
                  setAcked(false);
                }}
              >
                Go back
              </button>
              <button
                type="button"
                className="rowgon-btn-primary text-sm disabled:opacity-50"
                disabled={!acked}
                onClick={confirmWithoutEmail}
              >
                Create without email
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {verifyEmail ? (
        <EmailVerifyModal
          email={verifyEmail}
          next={next ?? "/app"}
          redirectAfter
          pendingSignupId={pendingSignupId ?? undefined}
          onVerified={() => router.push(next ?? "/app")}
        />
      ) : null}
    </>
  );
}
