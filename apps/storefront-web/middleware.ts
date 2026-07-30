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
/**
 * TODO-164A (ADR-228) — Builder preview izolasyonu. Store-admin builder iframe'i
 * storefront'a `?themePreview=<imzalı token>` ile gelir; middleware token'ı KISA
 * ÖMÜRLÜ, httpOnly cookie'ye yazar → sonraki tüm sayfalar (Home/PLP/PDP/Cart/
 * Checkout) DRAFT temayı render eder (getStoreTheme cookie'yi okur). Production
 * storefront (token yok) ETKİLENMEZ. Cookie kısa TTL; refresh sonrası draft korunur.
 */
const PREVIEW_COOKIE = "cos_theme_preview";
const PREVIEW_MAX_AGE = 600; // 10 dk (token TTL ile hizalı)

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const previewToken = request.nextUrl.searchParams?.get?.("themePreview") ?? null;

  const match = await resolveIncomingRedirect(request.nextUrl.pathname);
  const response = match
    ? NextResponse.redirect(new URL(match.target, request.nextUrl.origin), match.type)
    : NextResponse.next();

  if (previewToken) {
    response.cookies.set(PREVIEW_COOKIE, previewToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: PREVIEW_MAX_AGE,
      path: "/",
    });
  }
  return response;
}

/**
 * İçerik path'lerinde çalışır; statik/altyapı hariç (_next, media proxy, api, robots/sitemap, favicon) →
 * middleware bunlara vurmaz (performans + rewrite'larla çakışma yok).
 */
export const config = {
  // TODO-160 — `t/` (influencer tracking route) da hariç: kendi route handler'ında
  // click kaydı + cookie + güvenli redirect yapılır; SEO redirect resolver'a girmesin
  // (gereksiz gateway çağrısı + tıklama gecikmesi).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|media|api|t/|robots.txt|sitemap.xml).*)"],
};
