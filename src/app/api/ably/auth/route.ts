import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createUserTokenRequest, isAblyConfigured } from "@/lib/ably-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser Ably auth — token request for the signed-in user only.
 * Optional `?groupId=` ensures that chat's presence channel is included
 * (verified membership) when opening a thread after the last token mint.
 */
export async function GET(request: Request) {
  if (!isAblyConfigured()) {
    return NextResponse.json(
      { error: "Ably is not configured." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId")?.trim() || undefined;

  const tokenRequest = await createUserTokenRequest(user.id, {
    ensureGroupIds: groupId ? [groupId] : undefined,
  });
  if (!tokenRequest) {
    return NextResponse.json(
      { error: "Could not create Ably token." },
      { status: 500 },
    );
  }

  return NextResponse.json(tokenRequest);
}
