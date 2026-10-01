"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { requestEmailChangeAction } from "@/app/actions/email-verification";
import { EmailVerifyModal } from "@/app/components/email-verify-modal";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="tide-btn-secondary text-sm disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function ProfileSettingsForm({
  username,
  nickname,
  email,
}: {
  username: string;
  nickname: string;
  email: string | null;
}) {
  const router = useRouter();
  const [profileState, profileAction] = useActionState(updateProfileAction, null);
  const [emailState, emailAction] = useActionState(requestEmailChangeAction, null);
  const [emailValue, setEmailValue] = useState(email ?? "");
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  useEffect(() => {
    setEmailValue(email ?? "");
  }, [email]);

  useEffect(() => {
    if (
      emailState &&
      emailState.ok &&
      emailState.needsEmailVerification &&
      emailState.email
    ) {
      setVerifyEmail(emailState.email);
    }
  }, [emailState]);

  return (
    <div className="space-y-8">
      <form className="flex flex-col gap-4" action={profileAction}>
        <label className="block text-sm text-[#0A3D45]">
          <span className="mb-1 block font-medium">Username</span>
          <input
            name="username"
            required
            defaultValue={username}
            autoComplete="username"
            className="tide-input w-full"
          />
          <span className="mt-1 block text-xs text-[#0A3D45]/55">
            Login handle · letters, numbers, underscores
          </span>
        </label>

        <label className="block text-sm text-[#0A3D45]">
          <span className="mb-1 block font-medium">Nickname</span>
          <input
            name="nickname"
            defaultValue={nickname}
            placeholder="e.g. Alex River"
            className="tide-input w-full"
          />
          <span className="mt-1 block text-xs text-[#0A3D45]/55">
            Capitals and spaces allowed. Leave blank to show @username.
          </span>
        </label>

        {profileState && !profileState.ok ? (
          <p className="text-sm text-[#9b2f22]">{profileState.error}</p>
        ) : null}
        {profileState && profileState.ok ? (
          <p className="text-sm text-[#0A3D45]/75">Profile saved.</p>
        ) : null}

        <SubmitButton label="Save profile" />
      </form>

      <div className="border-t border-[#0A3D45]/10 pt-6">
        <h3 className="font-semibold text-[#0A3D45]">Email</h3>
        <p className="mt-1 text-xs text-[#0A3D45]/60">
          {email
            ? "Change your email anytime. We’ll send a 6-digit code to confirm the new address."
            : "Add an email, then enter the 6-digit code we send to verify it."}{" "}
          Check your spam folder if the code doesn’t arrive.
        </p>
        {email ? (
          <p className="mt-2 text-sm text-[#0A3D45]/75">
            Current verified email: <strong>{email}</strong>
          </p>
        ) : null}

        <form className="mt-3 flex flex-col gap-3" action={emailAction}>
          <input
            name="email"
            type="email"
            required
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="you@example.com"
            className="tide-input w-full"
          />
          {emailState && !emailState.ok ? (
            <p className="text-sm text-[#9b2f22]">{emailState.error}</p>
          ) : null}
          <SubmitButton label={email ? "Change email" : "Add email"} />
        </form>
      </div>

      {verifyEmail ? (
        <EmailVerifyModal
          email={verifyEmail}
          onVerified={() => {
            setVerifyEmail(null);
            router.refresh();
          }}
          onClose={() => setVerifyEmail(null)}
        />
      ) : null}
    </div>
  );
}
