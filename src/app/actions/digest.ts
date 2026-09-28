"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import {
  buildWeeklyDigest,
  weeklyDigestEmail,
} from "@/lib/weekly-digest";
import type { ActionResult } from "@/app/actions/auth";

export async function setWeeklyDigestEnabledAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await prisma.user.update({
    where: { id: user.id },
    data: { weeklyDigestEnabled: enabled },
  });
  revalidatePath("/app/notifications");
  return { ok: true };
}

export async function sendWeeklyDigestNowAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.email) {
    return {
      ok: false,
      error: "Add an email to your account to receive the weekly digest.",
    };
  }

  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const payload = await buildWeeklyDigest(user.id);
  if (!payload) return { ok: false, error: "Couldn’t build digest." };

  const mail = weeklyDigestEmail(payload);
  const sent = await sendEmail({
    to: full.email!,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  await prisma.user.update({
    where: { id: user.id },
    data: { weeklyDigestLastSentAt: new Date() },
  });

  // Also drop an in-app alert so the week is visible without email
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "WEEKLY_DIGEST",
      title: "Weekly digest",
      body: sent.mocked
        ? `${mail.subject} (dev — emailed to log, no RESEND_API_KEY)`
        : mail.subject,
      meta: JSON.stringify({
        overdue: payload.overdue.length,
        dueSoon: payload.dueSoon.length,
        inReview: payload.inReview.length,
      }),
    },
  });

  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return {
    ok: true,
    resetUrl: sent.mocked ? "logged in server console (dev mail)" : undefined,
  };
}
