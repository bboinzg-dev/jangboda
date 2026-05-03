import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupByBarcode } from "@/lib/foodsafety";

// GET /api/scan/[barcode] — 바코드 스캔 결과 lookup
//
// 1. Product.barcode 정확 매칭 → product 정보 + 가격 비교
// 2. 매칭 안 되면 식약처 C005 lookup → 카탈로그 정보 반환 (가격은 없음)
// 3. 둘 다 없으면 found: false
//
// 응답: { found, product?, prices?, foodsafety?, source }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  const { barcode: rawBarcode } = await params;
  const barcode = rawBarcode.trim();

  if (!barcode || !/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json(
      { found: false, error: "바코드 형식이 올바르지 않습니다 (8~14자리 숫자)" },
      { status: 400 }
    );
  }

  // 1) DB Product 정확 매칭
  const product = await prisma.product.findUnique({
    where: { barcode },
    include: {
      prices: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          store: {
            select: {
              id: true,
              name: true,
              chain: { select: { name: true, category: true } },
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  });

  if (product) {
    return NextResponse.json(
      {
        found: true,
        source: "db",
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          barcode: product.barcode,
          imageUrl: product.imageUrl,
          hasHaccp: product.hasHaccp,
        },
        prices: product.prices.map((p) => ({
          id: p.id,
          price: p.price,
          source: p.source,
          storeName: p.store.name,
          chainName: p.store.chain.name,
          chainCategory: p.store.chain.category,
          createdAt: p.createdAt,
        })),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  }

  // 2) Product 매칭 안 되면 식약처 C005 lookup (외부 API)
  try {
    const fs = await lookupByBarcode(barcode);
    if (fs) {
      return NextResponse.json(
        {
          found: true,
          source: "foodsafety",
          foodsafety: {
            barcode: fs.barcode,
            productName: fs.productName,
            manufacturer: fs.manufacturer,
            foodType: fs.foodType,
            category: fs.category,
            shelfLife: fs.shelfLife,
            manufacturerAddress: fs.manufacturerAddress,
          },
          prices: [],
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }
  } catch {
    // foodsafety lookup 실패 — 무시하고 not found 반환
  }

  return NextResponse.json(
    { found: false, barcode, source: "none" },
    { status: 404 }
  );
}
