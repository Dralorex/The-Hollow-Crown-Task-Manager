import { NextRequest, NextResponse } from "next/server";
import {
  getSsoAuthorizationUrl,
  isSsoEnabled,
  isWorkosConfigured,
} from "@/lib/workos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSO scaffold — disabled by default (ENABLE_SSO=false).
 * Does not replace username/password auth.
 */
export async function GET(request: NextRequest) {
  if (!isSsoEnabled()) {
    return NextResponse.json(
      {
        error:
          "SSO is disabled. Set ENABLE_SSO=true in development to try the WorkOS scaffold.",
      },
      { status: 403 },
    );
  }
  if (!isWorkosConfigured()) {
    return NextResponse.json(
      { error: "WorkOS is not configured." },
      { status: 503 },
    );
  }

  const organization =
    request.nextUrl.searchParams.get("organization") ?? undefined;
  const connection =
    request.nextUrl.searchParams.get("connection") ?? undefined;
  const provider =
    request.nextUrl.searchParams.get("provider") ?? undefined;
  const domainHint =
    request.nextUrl.searchParams.get("domain") ?? undefined;

  try {
    const url = getSsoAuthorizationUrl({
      organization,
      connection,
      provider,
      domainHint,
      state: "rowgon-sso-scaffold",
    });
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSO start failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
