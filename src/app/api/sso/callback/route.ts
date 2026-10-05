import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import {
  getWorkOS,
  getWorkosClientId,
  isSsoEnabled,
  isWorkosConfigured,
} from "@/lib/workos";
import { getAppBaseUrl } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WorkOS SSO callback scaffold.
 * Behind ENABLE_SSO=false by default — existing password sessions unaffected.
 * Maps WorkOS profile → User.workosUserId when possible; does not lock out
 * password users. Break-glass Owner recovery is a later Enterprise requirement.
 */
export async function GET(request: NextRequest) {
  if (!isSsoEnabled()) {
    return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=disabled`);
  }
  if (!isWorkosConfigured()) {
    return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=unconfigured`);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=missing_code`);
  }

  const workos = getWorkOS();
  const clientId = getWorkosClientId();
  if (!workos || !clientId) {
    return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=unconfigured`);
  }

  try {
    const { profile } = await workos.sso.getProfileAndToken({
      code,
      clientId,
    });

    const email = profile.email?.toLowerCase() ?? null;
    let user =
      (profile.id
        ? await prisma.user.findFirst({
            where: { workosUserId: profile.id, deletedAt: null },
          })
        : null) ??
      (email
        ? await prisma.user.findFirst({
            where: { email, deletedAt: null },
          })
        : null);

    if (!user) {
      // Scaffold: do not auto-create accounts yet — map existing users only.
      return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=no_user`);
    }

    if (!user.workosUserId && profile.id) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { workosUserId: profile.id },
      });
    }

    await createSession(user.id, { duration: 30 });
    return NextResponse.redirect(`${getAppBaseUrl()}/app`);
  } catch (err) {
    console.error("[sso:callback]", err);
    return NextResponse.redirect(`${getAppBaseUrl()}/login?sso=error`);
  }
}
