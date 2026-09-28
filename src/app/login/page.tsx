import Link from "next/link";
import { AuthForm } from "@/app/components/forms";
import { ShowPasswordField } from "@/app/components/show-password-field";
import { SignInDurationFields } from "@/app/components/sign-in-duration-fields";
import { UsernameField } from "@/app/components/username-field";
import { signInAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; addAccount?: string }>;
}) {
  const user = await getCurrentUser();
  const { next, addAccount } = await searchParams;
  const addingAccount = addAccount === "1" || addAccount === "true";
  if (user && !addingAccount) {
    redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/app");
  }

  return (
    <main className="rowgon-wave-bg flex min-h-screen items-center justify-center px-4 py-12">
      <div className="rowgon-panel w-full max-w-md p-8 animate-rowgon-rise">
        <Link
          href={addingAccount ? "/app" : "/"}
          className="font-[family-name:var(--font-display)] text-2xl text-[color:var(--rowgon-deep)]"
        >
          Rowgon
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-[color:var(--rowgon-deep)]">
          {addingAccount ? "Add an account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--rowgon-deep)]/70">
          {addingAccount
            ? "Sign in to another account to keep it on this device, or create a new one."
            : "Sign in with your username."}
        </p>

        <div className="mt-6">
          <AuthForm
            action={signInAction}
            submitLabel={addingAccount ? "Add & sign in" : "Sign in"}
            extras={
              <Link
                href="/forgot-password"
                className="text-center text-sm text-[color:var(--rowgon-deep)]/70 underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            }
          >
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {addingAccount ? (
              <input type="hidden" name="addAccount" value="1" />
            ) : null}
            <UsernameField />
            <ShowPasswordField autoComplete="current-password" />
            <SignInDurationFields />
          </AuthForm>
        </div>

        <p className="mt-6 text-center text-sm text-[color:var(--rowgon-deep)]/70">
          {addingAccount ? "Need a new login? " : "New here? "}
          <Link
            href={
              addingAccount
                ? `/signup?addAccount=1${next ? `&next=${encodeURIComponent(next)}` : ""}`
                : next
                  ? `/signup?next=${encodeURIComponent(next)}`
                  : "/signup"
            }
            className="font-semibold text-[color:var(--rowgon-deep)] underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
