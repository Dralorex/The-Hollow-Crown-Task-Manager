import type { MetadataRoute } from "next";

/**
 * Search engines may index public pages.
 * Known AI *training* / bulk scrapers are disallowed.
 *
 * Notes:
 * - robots.txt is honor-system; aggressive scrapers can ignore it (use WAF later if needed).
 * - You cannot whitelist “only my ChatGPT / Cursor account” here — those tools don’t
 *   crawl as a personal bot. Blocking GPTBot still allows you to paste/use the site
 *   yourself; it opts out of OpenAI’s training crawler.
 * - Google-Extended opts out of Gemini/Vertex training without hurting Google Search.
 * - /app and APIs stay disallowed for everyone.
 */
const AI_SCRAPER_AGENTS = [
  "GPTBot", // OpenAI training
  "Google-Extended", // Gemini / Vertex training opt-out (not Googlebot)
  "ClaudeBot",
  "anthropic-ai",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "Diffbot",
  "FacebookBot",
  "meta-externalagent",
  "Meta-ExternalAgent",
  "cohere-ai",
  "Amazonbot",
  "Ai2Bot",
  "AI2Bot",
  "Img2Dataset",
  "Timpibot",
  "Webzio-Extended",
  "YouBot",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_SCRAPER_AGENTS.map((userAgent) => ({
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
