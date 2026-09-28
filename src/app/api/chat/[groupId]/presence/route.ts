import { getCurrentUser } from "@/lib/auth";
import {
  publishChatPresence,
  subscribeChatPresence,
} from "@/lib/chat-presence-bus";
import { derivePresence } from "@/lib/chat-presence";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadPresencePayload(groupId: string, selfId: string) {
  const members = await prisma.chatMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, username: true } } },
  });
  return derivePresence(
    members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      lastSeenAt: m.lastSeenAt,
      typingAt: m.typingAt,
    })),
    selfId,
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { groupId } = await context.params;
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // stream closed
        }
      };

      const push = () => {
        void loadPresencePayload(groupId, user.id).then((presence) => {
          send("presence", presence);
        });
      };

      push();
      cleanup = subscribeChatPresence(groupId, push);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // stream closed
        }
      }, 15_000);

      // Nudge other tabs that someone connected
      publishChatPresence(groupId);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
