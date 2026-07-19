/**
 * TODO-156D tamamlama (ADR-082) — Storefront RUNTIME redirect çözümleme (SAF motor + hafif cache).
 *
 * Gateway public redirect ucundan (`GET /public/stores/:slug/redirects`) etkin kuralları çeker, `@commerce-os/utils`
 * SAF resolver'ıyla (chain collapse + loop guard) gelen pathname'i çözer. `middleware.ts` bunu 404'ten ÖNCE çağırır.
 *
 * Cache: modül-seviyesi TTL (worker isolate başına; Redis/yeni altyapı YOK — brief §6). DB/gateway her istekte
 * vurulmaz. Edge-safe: yalnız `fetch` + saf util (Node/Prisma importu yok). Hata/gateway-down → boş kural (redirect
 * yok, site kırılmaz).
 *
 * KAPSAM: yalnız PATH-tabanlı kaynaklar (ürün: `/products/{slug}`). Query-tabanlı (kategori `?category=`) kaynaklar
 * runtime index'ten HARİÇ tutulur — aksi halde `normalizeRedirectPath` query'yi düşürüp `/products` listeleme
 * sayfasıyla çakışırdı (yanlış redirect). Kategori runtime redirect = TECHNICAL_DEBT (`/categories/[slug]` gelince).
 */
import {
  buildRedirectIndex,
  resolveRedirect,
  type RedirectRule,
  type RedirectResolution,
  type RedirectType,
} from "@commerce-os/utils";

type RedirectIndex = ReturnType<typeof buildRedirectIndex>;

const CACHE_TTL_MS = 60_000;

let cache: { at: number; index: RedirectIndex } | null = null;

function gatewayBaseUrl(): string {
  // next.config.mjs ile AYNI çözümleme (edge/`next start` runtime env). Boş → localhost fallback.
  return process.env.API_GATEWAY_URL?.trim() || "http://localhost:4000";
}

function storeSlug(): string {
  return process.env.STOREFRONT_DEMO_STORE_SLUG?.trim() || "demo-store";
}

/** Public redirect ucundan kuralları çeker (query-kaynaklı olanlar runtime index'ten hariç). Hata → []. */
async function fetchRules(): Promise<RedirectRule[]> {
  try {
    const res = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(storeSlug())}/redirects`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { source: string; target: string; status: number }[] };
    const rows = body.data ?? [];
    return rows
      .filter((row) => typeof row.source === "string" && !row.source.includes("?"))
      .map((row) => ({
        source: row.source,
        target: row.target,
        type: row.status as RedirectType,
        enabled: true,
      }));
  } catch {
    return [];
  }
}

/** TTL cache'li index; süresi geçince yeniden çeker. `nowMs` enjekte edilebilir (test determinizmi). */
async function loadIndex(nowMs: number): Promise<RedirectIndex> {
  if (cache && nowMs - cache.at < CACHE_TTL_MS) return cache.index;
  const index = buildRedirectIndex(await fetchRules());
  cache = { at: nowMs, index };
  return index;
}

/**
 * Gelen pathname için redirect çözer (yoksa null). Chain collapse + loop guard SAF resolver'da. Deterministik.
 * @param nowMs test için enjekte edilebilir zaman (varsayılan Date.now()).
 */
export async function resolveIncomingRedirect(
  pathname: string,
  nowMs: number = Date.now(),
): Promise<RedirectResolution | null> {
  const index = await loadIndex(nowMs);
  return resolveRedirect(pathname, index);
}

/** Test yardımcısı: modül cache'ini sıfırlar (testler arası izolasyon). */
export function __resetRedirectCache(): void {
  cache = null;
}
