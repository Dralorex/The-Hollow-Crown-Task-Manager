"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type ActionResult,
} from "@/app/actions/auth";
import { EmailShortcutChips } from "@/app/components/email-field";
import { PasswordFields } from "@/app/components/password-fields";

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

/**
 * Two-step reset: send a 4-digit email code, then enter code + new password
 * on the website (no email link).
 */
export function PasswordResetForm() {
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [identifier, setIdentifier] = useState("");
  const [identifierFocused, setIdentifierFocused] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [requestState, requestAction] = useActionState(
    requestPasswordResetAction,
    null as ActionResult | null,
  );
  const [resetState, resetAction] = useActionState(
    resetPasswordAction,
    null as ActionResult | null,
  );

  useEffect(() => {
    if (!requestState?.ok) return;
    setStep("confirm");
    setDevCode(
      "resetCode" in requestState && requestState.resetCode
        ? requestState.resetCode
        : null,
    );
  }, [requestState]);

  if (step === "confirm") {
    return (
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm text-[#0A3D45]/75">
          Enter the 4-digit code we sent
          {identifier ? (
            <>
              {" "}
              for <strong>{identifier}</strong>
            </>
          ) : null}
          , then choose a new password.
        </p>
        {devCode ? (
          <p className="rounded-lg bg-[#3DBEAB]/15 px-3 py-2 text-sm text-[#0A3D45]">
            Dev mode (no email provider). Your code is{" "}
            <strong className="tracking-[0.2em]">{devCode}</strong>
          </p>
        ) : (
          <p className="rounded-lg bg-[#3DBEAB]/15 px-3 py-2 text-sm text-[#0A3D45]">
            If that account has an email, we sent a 4-digit code. Check your
            inbox (and spam).
          </p>
        )}
        <form className="flex w-full flex-col gap-4" action={resetAction}>
          <input type="hidden" name="identifier" value={identifier} />
          <label className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]">
            Reset code
            <input
              name="code"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="one-time-code"
              enterKeyHint="done"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="1234"
              className="rowgon-input tracking-[0.35em]"
              onChange={(e) => {
                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
              }}
            />
          </label>
          <PasswordFields
            passwordLabel="New password"
            confirmLabel="Confirm new password"
          />
          {resetState && !resetState.ok ? (
            <p className="rounded-lg bg-[#E85D4C]/12 px-3 py-2 text-sm text-[#9b2f22]">
              {resetState.error}
            </p>
          ) : null}
          <SubmitButton label="Update password" />
        </form>
        <button
          type="button"
          className="text-sm text-[#0A3D45]/70 underline-offset-2 hover:underline"
          onClick={() => {
            setStep("request");
            setDevCode(null);
          }}
        >
          Use a different account
        </button>
      </div>
    );
  }

  return (
    <form className="flex w-full flex-col gap-4" action={requestAction}>
      <label className="flex flex-col gap-1 text-sm font-medium text-[#0A3D45]">
        Username or email
        <input
          name="identifier"
          required
          className="rowgon-input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value.toLowerCase())}
          onInput={(e) => {
            const el = e.currentTarget;
            const lower = el.value.toLowerCase();
            if (el.value !== lower) {
              el.value = lower;
              setIdentifier(lower);
            }
          }}
          onFocus={() => setIdentifierFocused(true)}
          onBlur={() => setIdentifierFocused(false)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <EmailShortcutChips
        value={identifier}
        onChange={(next) => setIdentifier(next.toLowerCase())}
        visible={identifierFocused}
      />
      {requestState && !requestState.ok ? (
        <p className="rounded-lg bg-[#E85D4C]/12 px-3 py-2 text-sm text-[#9b2f22]">
          {requestState.error}
        </p>
      ) : null}
      <SubmitButton label="Send reset code" />
    </form>
  );
}
