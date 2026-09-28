import Link from "next/link";
import { PasswordResetForm } from "@/app/components/password-reset-form";

export default function ForgotPasswordPage() {
  return (
    <main className="rowgon-wave-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="rowgon-panel w-full max-w-md p-8 animate-rowgon-rise">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]"
        >
          Rowgon
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-[#0A3D45]">
          Reset password
        </h1>
        <p className="mt-2 text-sm text-[#0A3D45]/70">
          Enter your username or email. We’ll send a 6-digit code so you can
          choose a new password on this site.
        </p>

        <div className="mt-6">
          <PasswordResetForm />
        </div>

        <p className="mt-6 text-center text-sm text-[#0A3D45]/70">
          <Link
            href="/login"
            className="font-semibold underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
