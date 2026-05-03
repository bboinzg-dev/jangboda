// POST /api/sync/product-images
// - 모든 Product 중 imageUrl이 외부 URL인 것을 Supabase Storage로 다운로드 + 교체
// - partial-resume ?from=N&limit=N
// - chain self-trigger ?chain=true
// - imageUrl null인 상품은 skip (네이버 sync 후 다시 호출하면 cover됨)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  downloadProductImage,
  ensureProductImagesBucket,
} from "@/lib/storage/productImage";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  const url = new URL(req.url);
  const from = Math.max(0, parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
  const limit = Math.min(
    100,
    Math.max(10, parseInt(url.searchParams.get("limit") ?? "30", 10))
  );
  const chain = url.searchParams.get("chain") === "true";

  await ensureProductImagesBucket();

  // 외부 URL인 imageUrl만 처리 (이미 Supabase URL인 건 skip)
  const supabaseHost = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    "https://",
    ""
  );

  // 카탈로그 전체 카운트 — partial 판단
  const total = await prisma.product.count({
    where: {
      imageUrl: { not: null },
      NOT: { imageUrl: { contains: supabaseHost } }, // 이미 자체 호스팅된 건 제외
    },
  });

  const products = await prisma.product.findMany({
    where: {
      imageUrl: { not: null },
      NOT: { imageUrl: { contains: supabaseHost } },
    },
    select: { id: true, imageUrl: true },
    skip: from,
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let downloaded = 0;
  let failed = 0;
  for (const p of products) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    if (!p.imageUrl) continue;

    const newUrl = await downloadProductImage(p.id, p.imageUrl);
    if (newUrl) {
      await prisma.product.update({
        where: { id: p.id },
        data: { imageUrl: newUrl },
      });
      downloaded++;
    } else {
      failed++;
    }
  }

  const processedThrough = from + products.length;
  const partial = processedThrough < total;

  // chain self-trigger
  if (chain && partial) {
    const host = req.headers.get("host");
    if (host) {
      const proto = host.startsWith("localhost") ? "http" : "https";
      const params = new URLSearchParams({
        from: String(processedThrough),
        limit: String(limit),
        chain: "true",
      });
      void fetch(`${proto}://${host}/api/sync/product-images?${params}`, {
        method: "POST",
        headers: { "X-Sync-Token": process.env.SYNC_TOKEN || "" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    total,
    processed: products.length,
    downloaded,
    failed,
    partial,
    processedThrough,
    elapsedMs: Date.now() - startedAt,
  });
}
