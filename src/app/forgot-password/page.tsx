import Link from "next/link";
import { BrandLockup } from "@/app/components/brand-mark";
import { PasswordResetForm } from "@/app/components/password-reset-form";

export default function ForgotPasswordPage() {
  return (
    <main className="tide-wave-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="tide-panel w-full max-w-md p-8 animate-tide-rise">
        <Link href="/" className="text-[#0A3D45]" aria-label="Rowgon home">
          <BrandLockup size="lg" />
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
          <Link href="/login" className="font-semibold underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
