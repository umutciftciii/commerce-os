/**
 * TODO-167 (ADR-266) — Persistent Cart pure core (SAF; DB/Fastify bagimligi yok, dogrudan test edilir).
 *
 * Cart yalniz REFERANS tutar (variant + quantity). Bu modul deterministik login-merge,
 * quantity kelepcesi ve version/concurrency kararlarini icerir — hepsi yan-etkisiz.
 * Stok/urun varligi dogrulamasi SAF DEGILDIR (catalog I/O) ve route/data katmaninda,
 * bu modul cagrilmadan ONCE yapilir (yalniz gecerli variant referanslari girdi olur).
 */

export interface CartLineRef {
  variantId: string;
  quantity: number;
}

/** Bir cart'taki maksimum FARKLI satir sayisi (anonim cookie ile ayni ust sinir). */
export const CART_MAX_LINES = 100;
/** Satir basi minimum/maksimum adet. */
export const CART_MIN_QTY = 1;
export const CART_MAX_QTY = 999;

/** Adet degerini [1, 999] araligina kelepceler (tam sayiya asagi yuvarlar). */
export function clampQuantity(quantity: number): number {
  const floored = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  if (floored < CART_MIN_QTY) return CART_MIN_QTY;
  if (floored > CART_MAX_QTY) return CART_MAX_QTY;
  return floored;
}

/** Bir sonraki version (optimistic-concurrency; her anlamli mutation'da). */
export function nextVersion(current: number): number {
  return current + 1;
}

/** Beklenen version guncelden farkliysa mutation bayat (stale) sayilir → 409 CART_STALE. */
export function isStaleVersion(expected: number, current: number): boolean {
  return expected !== current;
}

export interface MergeResult {
  /** Nihai birlesmis satirlar (kelepcelenmis, 100 ile sinirli). Mevcut satirlar once. */
  lines: CartLineRef[];
  /** 100-satir sinirina sigmayan anonim satirlar (MERGE_LIMIT_EXCEEDED; sessiz kayip yok). */
  overflow: CartLineRef[];
  /** Uygulanan (mevcuda toplanan veya eklenen) anonim satir sayisi. */
  merged: number;
  /** Sinir nedeniyle dusurulen anonim satir sayisi. */
  skipped: number;
}

/**
 * Deterministik login-merge: mevcut authenticated satirlar KORUNUR (sira/konum); anonim
 * satirlar cookie sirasiyla eklenir; ayni variant quantity'leri toplanir + [1,999]
 * kelepcelenir; FARKLI satir sayisi 100 ile sinirlanir. Sinira sigmayan YENI variant'lar
 * `overflow`'a raporlanir (sessiz kayip yok). Mevcut bir variant'a toplama, sinirdayken
 * bile serbesttir (yeni satir acmaz). Gecersiz id/adet defansif dusurulur.
 */
export function mergeCartLines(existing: CartLineRef[], incoming: CartLineRef[]): MergeResult {
  const order: string[] = [];
  const byVariant = new Map<string, number>();

  const sanitize = (ref: CartLineRef): { variantId: string; quantity: number } | null => {
    const variantId = typeof ref.variantId === "string" ? ref.variantId.trim() : "";
    const quantity = Number.isFinite(ref.quantity) ? Math.floor(ref.quantity) : 0;
    if (!variantId || quantity <= 0) return null;
    return { variantId, quantity };
  };

  // Mevcut authenticated satirlar: sira korunur, adet defansif kelepcelenir.
  for (const ref of existing) {
    const clean = sanitize(ref);
    if (!clean) continue;
    if (byVariant.has(clean.variantId)) {
      byVariant.set(clean.variantId, clampQuantity(byVariant.get(clean.variantId)! + clean.quantity));
    } else {
      order.push(clean.variantId);
      byVariant.set(clean.variantId, clampQuantity(clean.quantity));
    }
  }

  const overflow: CartLineRef[] = [];
  let merged = 0;
  let skipped = 0;

  for (const ref of incoming) {
    const clean = sanitize(ref);
    if (!clean) continue;
    if (byVariant.has(clean.variantId)) {
      // Mevcut satira toplama: sinirdayken bile serbest (yeni satir acmaz).
      byVariant.set(clean.variantId, clampQuantity(byVariant.get(clean.variantId)! + clean.quantity));
      merged += 1;
    } else if (order.length < CART_MAX_LINES) {
      order.push(clean.variantId);
      byVariant.set(clean.variantId, clampQuantity(clean.quantity));
      merged += 1;
    } else {
      // 100-satir siniri: yeni FARKLI variant sigmaz → raporla (sessiz kayip yok).
      overflow.push({ variantId: clean.variantId, quantity: clampQuantity(clean.quantity) });
      skipped += 1;
    }
  }

  const lines = order.map((variantId) => ({ variantId, quantity: byVariant.get(variantId)! }));
  return { lines, overflow, merged, skipped };
}
