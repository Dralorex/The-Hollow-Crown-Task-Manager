"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditContent, requireMembership } from "@/lib/permissions";
import type { ActionResult } from "@/app/actions/auth";

function parseDay(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  if (!title) return { ok: false as const, error: "Title is required." };
  if (!dateRaw) return { ok: false as const, error: "Pick a date." };
  const date = new Date(`${dateRaw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { ok: false as const, error: "Invalid date." };
  return { ok: true as const, title, description, date };
}

export async function createPersonalEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = parseDay(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await prisma.personalCalendarEvent.create({
    data: {
      userId: user.id,
      title: parsed.title,
      description: parsed.description,
      date: parsed.date,
    },
  });

  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function deletePersonalEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.personalCalendarEvent.findFirst({
    where: { id: eventId, userId: user.id },
  });
  if (!event) return { ok: false, error: "Event not found." };

  await prisma.personalCalendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function createWorkspaceEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can add workspace events." };
  }

  const parsed = parseDay(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  await prisma.workspaceCalendarEvent.create({
    data: {
      workspaceId,
      createdById: user.id,
      title: parsed.title,
      description: parsed.description,
      date: parsed.date,
    },
  });

  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function deleteWorkspaceEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");
  const event = await prisma.workspaceCalendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const membership = await requireMembership(event.workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can remove workspace events." };
  }

  await prisma.workspaceCalendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function setCalendarWorkspaceFilterAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await requireMembership(workspaceId, user.id);

  await prisma.calendarWorkspaceFilter.upsert({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId },
    },
    create: { userId: user.id, workspaceId, enabled },
    update: { enabled },
  });

  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function setShowBirthdaysAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const show = String(formData.get("show") ?? "") === "true";
  await prisma.user.update({
    where: { id: user.id },
    data: { showBirthdaysOnCalendar: show },
  });
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function setBirthdayAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const raw = String(formData.get("birthday") ?? "").trim();
  if (!raw) {
    await prisma.user.update({
      where: { id: user.id },
      data: { birthday: null },
    });
    revalidatePath("/app/calendar");
    return { ok: true };
  }

  // Store as UTC noon on a fixed year so month/day display is stable
  const parsed = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "Invalid birthday." };
  }
  const birthday = new Date(
    Date.UTC(2000, parsed.getUTCMonth(), parsed.getUTCDate(), 12),
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { birthday },
  });
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function moveCalendarItemAction(
  kind: "personal" | "task" | "workspace",
  recordId: string,
  dateRaw: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const date = new Date(`${dateRaw}T12:00:00`);
  if (!dateRaw || Number.isNaN(date.getTime())) {
    return { ok: false, error: "Invalid date." };
  }

  if (kind === "personal") {
    const event = await prisma.personalCalendarEvent.findFirst({
      where: { id: recordId, userId: user.id },
    });
    if (!event) return { ok: false, error: "Event not found." };
    await prisma.personalCalendarEvent.update({
      where: { id: recordId },
      data: { date },
    });
    revalidatePath("/app/calendar");
    return { ok: true };
  }

  if (kind === "workspace") {
    const event = await prisma.workspaceCalendarEvent.findUnique({
      where: { id: recordId },
    });
    if (!event) return { ok: false, error: "Event not found." };
    const membership = await requireMembership(event.workspaceId, user.id);
    if (!canEditContent(membership.role)) {
      return { ok: false, error: "Only editors and above can move workspace events." };
    }
    await prisma.workspaceCalendarEvent.update({
      where: { id: recordId },
      data: { date },
    });
    revalidatePath("/app/calendar");
    return { ok: true };
  }

  // task — recordId is CalendarEvent id
  const cal = await prisma.calendarEvent.findFirst({
    where: { id: recordId, userId: user.id },
    include: { task: true },
  });
  if (!cal) return { ok: false, error: "Task event not found." };

  const membership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: cal.task.workspaceId,
        userId: user.id,
      },
    },
  });
  if (!membership) return { ok: false, error: "Forbidden." };

  const isAssignee = cal.task.assigneeId === user.id;
  if (!isAssignee && !canEditContent(membership.role)) {
    return { ok: false, error: "You can only move tasks you’re assigned to." };
  }

  await prisma.task.update({
    where: { id: cal.taskId },
    data: { dueDate: date },
  });
  const { syncCalendarForTask } = await import("@/lib/calendar");
  await syncCalendarForTask(cal.taskId);

  revalidatePath("/app/calendar");
  revalidatePath(`/app/w/${cal.task.workspaceId}`);
  return { ok: true };
}
