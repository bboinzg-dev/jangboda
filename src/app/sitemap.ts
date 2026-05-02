import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const BASE = "https://jangboda.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), priority: 1 },
    { url: `${BASE}/search`, lastModified: new Date(), priority: 0.9 },
    { url: `${BASE}/cart`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE}/stores`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE}/upload`, lastModified: new Date(), priority: 0.6 },
  ];

  // 상품 상세 페이지 — 너무 많으면 100개만
  try {
    const products = await prisma.product.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${BASE}/products/${p.id}`,
      lastModified: p.createdAt,
      priority: 0.7,
    }));
    return [...staticPages, ...productPages];
  } catch {
    return staticPages;
  }
}
