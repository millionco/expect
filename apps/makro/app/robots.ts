import type { MetadataRoute } from "next";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "http://localhost:3000/sitemap.xml",
  } satisfies MetadataRoute.Robots;
}
