import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBlockedAiScraper } from "@/lib/ai-scrapers";

/**
 * Lightweight edge WAF: refuse known AI training scrapers.
 * robots.txt asks politely; this returns 403 if they ignore it.
 *
 * Not a full commercial WAF (no global rate-limit DB yet). Good enough
 * for reputable crawlers that send honest User-Agent strings.
 */
export function proxy(request: NextRequest) {
  const ua = request.headers.get("user-agent");
  if (isBlockedAiScraper(ua)) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on app routes; skip Next internals and common static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
