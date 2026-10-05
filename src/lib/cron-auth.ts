import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 * Local/dev can also pass `x-cron-secret: <CRON_SECRET>`.
 */
export function assertCronAuthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function runCronStub(
  name: string,
  work: () => Promise<{ processed: number; detail?: string }>,
) {
  // Logging is best-effort so cron stubs still work before migrate deploy.
  let runId: string | null = null;
  try {
    const run = await prisma.cronRun.create({ data: { name } });
    runId = run.id;
  } catch (err) {
    console.warn("[cron] CronRun log create skipped", err);
  }

  try {
    const result = await work();
    if (runId) {
      await prisma.cronRun
        .update({
          where: { id: runId },
          data: {
            finishedAt: new Date(),
            ok: true,
            detail: result.detail ?? `processed=${result.processed}`,
          },
        })
        .catch((err) => console.warn("[cron] CronRun log update skipped", err));
    }
    return {
      ok: true as const,
      ran: name,
      processed: result.processed,
      runId,
      detail: result.detail,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      await prisma.cronRun
        .update({
          where: { id: runId },
          data: {
            finishedAt: new Date(),
            ok: false,
            detail: message.slice(0, 500),
          },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}
