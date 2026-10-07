import type { MetadataRoute } from "next";
import { AI_SCRAPER_UA_TOKENS } from "@/lib/ai-scrapers";

/**
 * Search engines may index public pages.
 * Known AI training / bulk scrapers are disallowed (and also 403’d in proxy.ts).
 *
 * robots.txt is honor-system; the proxy WAF enforces for crawlers that send
 * these User-Agent strings. You can still use ChatGPT/Cursor to build the site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_SCRAPER_UA_TOKENS.map((userAgent) => ({
        userAgent,
        disallow: ["/"] as string[],
      })),
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/app/", "/api/", "/invite/", "/reset-password"],
      },
    ],
    sitemap: "https://www.rowgon.com/sitemap.xml",
    host: "https://www.rowgon.com",
  };
}
