/**
 * Known AI training / bulk-scrape user-agent tokens.
 * Used by robots.txt (polite opt-out) and proxy WAF (hard 403).
 *
 * Does not include normal browsers, Googlebot/Bingbot, or your own
 * ChatGPT/Cursor sessions (those don’t identify as these crawlers).
 */
export const AI_SCRAPER_UA_TOKENS = [
  "GPTBot",
  "Google-Extended",
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
  "PetalBot",
  "DataForSeoBot",
  "magpie-crawler",
] as const;

export function isBlockedAiScraper(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return AI_SCRAPER_UA_TOKENS.some((token) => ua.includes(token.toLowerCase()));
}
