import { prisma } from "@/lib/db";

export async function recordTaskActivity(input: {
  taskId: string;
  actorId?: string | null;
  type: string;
  message: string;
}) {
  await prisma.taskActivity.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId ?? null,
      type: input.type,
      message: input.message,
    },
  });
}
