import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createUserTokenRequest, isAblyConfigured } from "@/lib/ably-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser Ably auth — returns a token request for the signed-in user only. */
export async function GET() {
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

  const tokenRequest = await createUserTokenRequest(user.id);
  if (!tokenRequest) {
    return NextResponse.json(
      { error: "Could not create Ably token." },
      { status: 500 },
    );
  }

  return NextResponse.json(tokenRequest);
}
