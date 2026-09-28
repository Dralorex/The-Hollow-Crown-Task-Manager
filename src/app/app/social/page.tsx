import { redirect } from "next/navigation";
import { InlineActionForm } from "@/app/components/forms";
import {
  respondFriendRequestAction,
  sendFriendRequestAction,
} from "@/app/actions/social";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function SocialPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    include: { requester: true, addressee: true },
  });

  const incoming = await prisma.friendship.findMany({
    where: { addresseeId: user.id, status: "PENDING" },
    include: { requester: true },
  });

  const friends = friendships.map((f) =>
    f.requesterId === user.id ? f.addressee : f.requester,
  );

  return (
    <><main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
          Friends
        </h1>
        <p className="mt-2 text-[#0A3D45]/70">
          Friends can DM without sharing a workspace. Workspace-only DMs still need an
          accept on the first message.
        </p>

        <div className="rowgon-panel mt-8 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
            Add a friend
          </h2>
          <InlineActionForm
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            action={sendFriendRequestAction}
            submitLabel="Send request"
          >
            <input
              name="username"
              required
              placeholder="username"
              className="rowgon-input"
            />
          </InlineActionForm>
        </div>

        {incoming.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
              Requests
            </h2>
            <ul className="mt-3 space-y-2">
              {incoming.map((r) => (
                <li
                  key={r.id}
                  className="rowgon-panel flex items-center justify-between gap-3 p-4"
                >
                  <span>@{r.requester.username}</span>
                  <div className="flex gap-2">
                    <InlineActionForm
                      action={respondFriendRequestAction}
                      submitLabel="Accept"
                    >
                      <input type="hidden" name="friendshipId" value={r.id} />
                      <input type="hidden" name="accept" value="true" />
                    </InlineActionForm>
                    <InlineActionForm
                      action={respondFriendRequestAction}
                      submitLabel="Decline"
                    >
                      <input type="hidden" name="friendshipId" value={r.id} />
                      <input type="hidden" name="accept" value="false" />
                    </InlineActionForm>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
            Your circle
          </h2>
          <ul className="mt-3 space-y-2">
            {friends.length === 0 ? (
              <li className="text-[#0A3D45]/60">No friends yet.</li>
            ) : (
              friends.map((f) => (
                <li key={f.id} className="rowgon-panel px-4 py-3">
                  @{f.username}
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </>
  );
}
