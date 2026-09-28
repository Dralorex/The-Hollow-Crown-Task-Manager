import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/mail";
import { canEditContent } from "@/lib/permissions";
import { isArchived } from "@/lib/archive";

export type DigestTaskLine = {
  id: string;
  name: string;
  workspaceName: string;
  workspaceId: string;
  folderId: string;
  dueLabel: string | null;
  status: string;
};

export type WeeklyDigestPayload = {
  username: string;
  weekLabel: string;
  overdue: DigestTaskLine[];
  dueSoon: DigestTaskLine[];
  inReview: DigestTaskLine[];
  claimedOpen: DigestTaskLine[];
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toLine(task: {
  id: string;
  name: string;
  status: string;
  dueDate: Date | null;
  folderId: string;
  workspace: { id: string; name: string };
}): DigestTaskLine {
  return {
    id: task.id,
    name: task.name,
    workspaceName: task.workspace.name,
    workspaceId: task.workspace.id,
    folderId: task.folderId,
    dueLabel: task.dueDate ? format(task.dueDate, "MMM d") : null,
    status: task.status,
  };
}

export async function buildWeeklyDigest(
  userId: string,
): Promise<WeeklyDigestPayload | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const now = new Date();
  const weekEnd = endOfDay(addDays(startOfDay(now), 7));

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      workspace: { archivedAt: null },
    },
    include: { workspace: true },
  });
  if (memberships.length === 0) {
    return {
      username: user.username,
      weekLabel: `${format(now, "MMM d")} – ${format(weekEnd, "MMM d")}`,
      overdue: [],
      dueSoon: [],
      inReview: [],
      claimedOpen: [],
    };
  }

  const workspaceIds = memberships.map((m) => m.workspaceId);
  const canReviewIds = new Set(
    memberships.filter((m) => canEditContent(m.role)).map((m) => m.workspaceId),
  );

  const myTasks = await prisma.task.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      assigneeId: userId,
      status: { in: ["OPEN", "CLAIMED", "IN_REVIEW"] },
      folder: { archivedAt: null },
      workspace: { archivedAt: null },
    },
    include: { workspace: true },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
  });

  const reviewTasks =
    canReviewIds.size > 0
      ? await prisma.task.findMany({
          where: {
            workspaceId: { in: [...canReviewIds] },
            status: "IN_REVIEW",
            folder: { archivedAt: null },
            workspace: { archivedAt: null },
          },
          include: { workspace: true },
          orderBy: [{ dueDate: "asc" }, { name: "asc" }],
          take: 20,
        })
      : [];

  const overdue: DigestTaskLine[] = [];
  const dueSoon: DigestTaskLine[] = [];
  const claimedOpen: DigestTaskLine[] = [];

  for (const task of myTasks) {
    if (isArchived(task.workspace)) continue;
    const line = toLine(task);
    if (task.dueDate && task.dueDate < startOfDay(now)) {
      overdue.push(line);
    } else if (task.dueDate && task.dueDate <= weekEnd) {
      dueSoon.push(line);
    } else if (task.status === "CLAIMED" || task.status === "OPEN") {
      claimedOpen.push(line);
    }
  }

  return {
    username: user.username,
    weekLabel: `${format(now, "MMM d")} – ${format(weekEnd, "MMM d")}`,
    overdue,
    dueSoon,
    inReview: reviewTasks.map(toLine),
    claimedOpen: claimedOpen.slice(0, 15),
  };
}

function listHtml(title: string, items: DigestTaskLine[], base: string) {
  if (items.length === 0) return "";
  const rows = items
    .map((t) => {
      const href = `${base}/app/w/${t.workspaceId}?folder=${t.folderId}`;
      const due = t.dueLabel ? ` · due ${escapeHtml(t.dueLabel)}` : "";
      return `<li style="margin:0 0 8px;">
        <a href="${href}" style="color:#0A3D45;font-weight:600;text-decoration:none;">${escapeHtml(t.name)}</a>
        <span style="color:rgba(10,61,69,0.6);font-size:13px;"> — ${escapeHtml(t.workspaceName)}${due}</span>
      </li>`;
    })
    .join("");
  return `<h2 style="margin:20px 0 8px;font-size:16px;color:#0A3D45;">${title}</h2><ul style="margin:0;padding-left:18px;">${rows}</ul>`;
}

function listText(title: string, items: DigestTaskLine[], base: string) {
  if (items.length === 0) return "";
  const rows = items
    .map((t) => {
      const href = `${base}/app/w/${t.workspaceId}?folder=${t.folderId}`;
      const due = t.dueLabel ? ` (due ${t.dueLabel})` : "";
      return `- ${t.name} · ${t.workspaceName}${due}\n  ${href}`;
    })
    .join("\n");
  return `\n${title}\n${rows}\n`;
}

export function weeklyDigestEmail(payload: WeeklyDigestPayload) {
  const base = getAppBaseUrl();
  const empty =
    payload.overdue.length === 0 &&
    payload.dueSoon.length === 0 &&
    payload.inReview.length === 0 &&
    payload.claimedOpen.length === 0;

  const bodyHtml = empty
    ? `<p style="margin:0;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        Hi @${escapeHtml(payload.username)} — nothing urgent on your plate for
        <strong>${escapeHtml(payload.weekLabel)}</strong>. Nice tide.
      </p>`
    : `<p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        Hi @${escapeHtml(payload.username)} — your Rowgon week
        (<strong>${escapeHtml(payload.weekLabel)}</strong>):
      </p>
      ${listHtml("Overdue", payload.overdue, base)}
      ${listHtml("Due in the next 7 days", payload.dueSoon, base)}
      ${listHtml("Needs review", payload.inReview, base)}
      ${listHtml("Still on your plate", payload.claimedOpen, base)}
      <p style="margin:20px 0 0;">
        <a href="${base}/app" style="display:inline-block;background:#0A3D45;color:#E8F7F6;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:14px;font-weight:600;">
          Open Rowgon
        </a>
      </p>`;

  const bodyText = empty
    ? `Hi @${payload.username} — nothing urgent for ${payload.weekLabel}.\n${base}/app\n`
    : `Hi @${payload.username} — Rowgon week (${payload.weekLabel})\n` +
      listText("Overdue", payload.overdue, base) +
      listText("Due in the next 7 days", payload.dueSoon, base) +
      listText("Needs review", payload.inReview, base) +
      listText("Still on your plate", payload.claimedOpen, base) +
      `\nOpen: ${base}/app\n`;

  return {
    subject: empty
      ? `Rowgon weekly · clear seas`
      : `Rowgon weekly · ${payload.overdue.length ? `${payload.overdue.length} overdue` : "your week"}`,
    html: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#E8F7F6;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E8F7F6;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid rgba(10,61,69,0.12);">
<tr><td style="color:#0A3D45;">
<p style="margin:0 0 8px;font-size:22px;font-weight:700;">Rowgon</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Weekly digest</h1>
${bodyHtml}
<p style="margin:24px 0 0;font-size:12px;color:rgba(10,61,69,0.55);">
  Manage this email from Alerts in Rowgon.
</p>
</td></tr></table>
</td></tr></table>
</body></html>`,
    text: `Rowgon\n\nWeekly digest\n\n${bodyText}\nManage from Alerts in Rowgon.\n`,
  };
}

export function digestIsEmpty(payload: WeeklyDigestPayload) {
  return (
    payload.overdue.length === 0 &&
    payload.dueSoon.length === 0 &&
    payload.inReview.length === 0 &&
    payload.claimedOpen.length === 0
  );
}
