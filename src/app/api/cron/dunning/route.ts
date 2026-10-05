import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized, runCronStub } from "@/lib/cron-auth";
import { runDunningStub } from "@/lib/cron-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  try {
    const result = await runCronStub("dunning", runDunningStub);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron:dunning]", err);
    return NextResponse.json(
      { ok: false, error: "Cron run failed." },
      { status: 500 },
    );
  }
}
