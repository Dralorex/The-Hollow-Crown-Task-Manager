import Link from "next/link";
import { SignUpForm } from "@/app/components/signup-form";
import { signUpAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignUpPage({
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
          {addingAccount ? "Create another account" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--rowgon-deep)]/70">
          {addingAccount
            ? "Make a new login for this device — personal, business, or anything else. Same Rowgon, separate account."
            : "Username and password are enough. Add an email to get a welcome confirmation and password reset later."}
        </p>

        <div className="mt-6">
          <SignUpForm
            action={signUpAction}
            next={
              next?.startsWith("/") && !next.startsWith("//") ? next : undefined
            }
          />
        </div>

        <p className="mt-6 text-center text-sm text-[color:var(--rowgon-deep)]/70">
          Already aboard?{" "}
          <Link
            href={
              addingAccount
                ? `/login?addAccount=1${next ? `&next=${encodeURIComponent(next)}` : ""}`
                : next
                  ? `/login?next=${encodeURIComponent(next)}`
                  : "/login"
            }
            className="font-semibold text-[color:var(--rowgon-deep)] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
