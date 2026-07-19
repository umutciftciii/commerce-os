import { NextResponse, type NextRequest } from "next/server";
import { resolveIncomingRedirect } from "./lib/seo/redirect-runtime";

/**
 * TODO-156D tamamlama (brief §4/§5/§7) — RUNTIME redirect çözümleme (route render + 404'ten ÖNCE, merkezî katman).
 *
 * Akış: gelen pathname → redirect tablosu (cache'li) → eşleşme varsa doğru HTTP kodu (301/302/307/308) ile
 * yönlendir; yoksa `NextResponse.next()` (route devam → gerekiyorsa 404). Chain collapse + loop guard SAF
 * resolver'da; broken/loop/missing → null → next() (soft redirect YOK, ana sayfaya yönlendirme YOK).
 *
 * Hedef path (query'siz, normalize) → mutlak URL. Canonical ile çelişmez: kanonik canlı sayfalar asla redirect
 * source olmaz (gateway write-path chain collapse + source=newPath silme garantisi).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const match = await resolveIncomingRedirect(request.nextUrl.pathname);
  if (!match) return NextResponse.next();
  const target = new URL(match.target, request.nextUrl.origin);
  return NextResponse.redirect(target, match.type);
}

/**
 * İçerik path'lerinde çalışır; statik/altyapı hariç (_next, media proxy, api, robots/sitemap, favicon) →
 * middleware bunlara vurmaz (performans + rewrite'larla çakışma yok).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media|api|robots.txt|sitemap.xml).*)"],
};
