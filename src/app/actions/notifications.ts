"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/app/actions/auth";

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      read: false,
      type: { notIn: ["CHAT_MESSAGE", "DM_REQUEST"] },
    },
    data: { read: true },
  });
  revalidatePath("/app", "layout");
  revalidatePath("/app/notifications");
}

export async function markNotificationReadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(formData.get("notificationId") ?? "");
  if (!id) return { ok: false, error: "Missing notification." };

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { read: true },
  });

  revalidatePath("/app", "layout");
  revalidatePath("/app/notifications");
  return { ok: true };
}
