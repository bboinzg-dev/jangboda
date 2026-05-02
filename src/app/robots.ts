import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/sync"],
      },
    ],
    sitemap: "https://jangboda.vercel.app/sitemap.xml",
  };
}
