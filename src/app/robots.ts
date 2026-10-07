import type { MetadataRoute } from "next";

/**
 * Public marketing/auth pages may be crawled.
 * Logged-in app routes stay out of search indexes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/invite/", "/reset-password"],
    },
    sitemap: "https://www.rowgon.com/sitemap.xml",
    host: "https://www.rowgon.com",
  };
}
