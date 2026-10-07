import type { MetadataRoute } from "next";

/** Public URLs only — private /app routes are excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.rowgon.com";
  const lastModified = new Date();

  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/signup`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/forgot-password`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
