/**
 * TODO-159E (ADR-094) — Storefront public yorum listesi PROXY route handler.
 *
 * PDP client bileşeni (filtre/sort/sayfalama) BURAYA fetch eder — gateway'e DOĞRUDAN değil
 * (gateway URL'i sunucu-yalnız kalır). `getProductReviews` BFF'ini çağırır; yalnız APPROVED
 * yorumlar + özet + pagination döner (allowlist gateway'de zorlanır).
 */
import { NextResponse } from "next/server";
import { getProductReviews, type ReviewListParams } from "../../../../lib/server/reviews";

export const dynamic = "force-dynamic";

const SORTS = ["newest", "oldest", "highest", "lowest", "most_helpful"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const url = new URL(request.url);
  const pageRaw = url.searchParams.get("page");
  const ratingRaw = url.searchParams.get("rating");
  const sortRaw = url.searchParams.get("sort");

  const query: ReviewListParams = {};
  if (pageRaw && /^\d+$/.test(pageRaw)) query.page = Number(pageRaw);
  if (ratingRaw && /^[1-5]$/.test(ratingRaw)) query.rating = Number(ratingRaw);
  if (sortRaw && (SORTS as readonly string[]).includes(sortRaw)) {
    query.sort = sortRaw as ReviewListParams["sort"];
  }

  const result = await getProductReviews(productId, query);
  if (!result) {
    return NextResponse.json({ error: { code: "REVIEWS_UNAVAILABLE" } }, { status: 502 });
  }
  return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "private, max-age=15" } });
}
