"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions/auth";
import { enterAdvancesFocus } from "@/lib/form-keyboard";

export type { ActionResult };

type FormAction = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult | null>;

function SubmitButton({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? "Working…" : label}
    </button>
  );
}

export function AuthForm({
  action,
  submitLabel,
  children,
  extras,
}: {
  action: FormAction;
  submitLabel: string;
  children: React.ReactNode;
  extras?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form className="flex w-full flex-col gap-4" action={formAction}>
      {children}
      {state && !state.ok ? (
        <p className="rounded-lg bg-[#E85D4C]/12 px-3 py-2 text-sm text-[#9b2f22]">
          {state.error}
        </p>
      ) : null}
      {state && state.ok && state.resetUrl ? (
        <p className="rounded-lg bg-[#3DBEAB]/15 px-3 py-2 text-sm text-[#0A3D45]">
          Reset link ready (dev): {state.resetUrl} — in production this would be emailed.
        </p>
      ) : null}
      {state && state.ok && !state.resetUrl ? (
        <p className="rounded-lg bg-[#3DBEAB]/15 px-3 py-2 text-sm text-[#0A3D45]">
          If that account has an email, a reset link was prepared.
        </p>
      ) : null}
      <SubmitButton label={submitLabel} className="rowgon-btn-primary" />
      {extras}
    </form>
  );
}

export function InlineActionForm({
  action,
  submitLabel,
  children,
  className,
  submitVariant = "secondary",
  submitClassName,
  onSuccess,
}: {
  action: FormAction;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  submitVariant?: "primary" | "secondary";
  submitClassName?: string;
  /** Called after a successful action result (e.g. reset local fields). */
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const handledSuccess = useRef<ActionResult | null>(null);
  const base =
    submitVariant === "primary" ? "rowgon-btn-primary text-sm" : "rowgon-btn-secondary text-sm";

  useEffect(() => {
    if (!state?.ok || !onSuccess) return;
    if (handledSuccess.current === state) return;
    handledSuccess.current = state;
    onSuccess();
  }, [state, onSuccess]);

  return (
    <form
      className={className ?? "flex flex-col gap-3"}
      action={formAction}
      onKeyDown={enterAdvancesFocus}
    >
      {children}
      {state && !state.ok ? (
        <p className="text-sm text-[#9b2f22]">{state.error}</p>
      ) : null}
      <SubmitButton
        label={submitLabel}
        className={`${base} ${submitClassName ?? ""}`.trim()}
      />
    </form>
  );
}
