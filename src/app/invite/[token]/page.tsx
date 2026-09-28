import { redirect } from "next/navigation";
import Link from "next/link";
import { acceptInviteAction } from "@/app/actions/workspaces";
import { InlineActionForm } from "@/app/components/forms";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const user = await getCurrentUser();
  const { token } = await params;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { workspace: true },
  });

  if (!invite || invite.status !== "PENDING") {
    return (
      <main className="rowgon-wave-bg flex min-h-screen items-center justify-center px-4">
        <div className="rowgon-panel max-w-md p-8 text-center">
          <p>This invite isn’t available.</p>
          <Link href="/app" className="mt-4 inline-block font-semibold">
            Go to app
          </Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="rowgon-wave-bg flex min-h-screen items-center justify-center px-4">
        <div className="rowgon-panel max-w-md p-8 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
            Join {invite.workspace.name}
          </h1>
          <p className="mt-2 text-sm text-[#0A3D45]/70">
            Sign in or create an account matching{" "}
            {invite.targetUsername
              ? `@${invite.targetUsername}`
              : invite.targetEmail}{" "}
            to accept.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/login" className="rowgon-btn-primary">
              Sign in
            </Link>
            <Link href="/signup" className="rowgon-btn-secondary">
              Sign up
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="rowgon-wave-bg flex min-h-screen items-center justify-center px-4">
      <div className="rowgon-panel max-w-md p-8 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
          Join {invite.workspace.name}
        </h1>
        <p className="mt-2 text-sm text-[#0A3D45]/70">
          Role: {invite.role.toLowerCase()}
        </p>
        <div className="mt-6 flex justify-center">
          <InlineActionForm action={acceptInviteAction} submitLabel="Accept invite">
            <input type="hidden" name="token" value={token} />
          </InlineActionForm>
        </div>
      </div>
    </main>
  );
}
