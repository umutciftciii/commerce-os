import type { ReactNode } from "react";
import { cn } from "@commerce-os/ui";

/**
 * MOCK: Urun gorseli — gercek veri kaynagi yok, bkz. todo.md (P0 / ONKOSUL).
 *
 * Prisma Product/ProductVariant modellerinde ve public DTO'da HICBIR gorsel alani
 * yoktur. Premium vitrin gorsel-oncelikli oldugundan, gorsel altyapisi gelene
 * kadar DETERMINISTIK (handle'a gore stabil) bir yer tutucu kompozisyon gosterilir:
 * sicak notr zemin + ince serif monogram. Rastgele degildir (SSR/CSR tutarli).
 *
 * TEK DEGISIM NOKTASI: gercek gorsel geldiginde yalnizca `productImageSrc()` bir
 * URL dondurur ve buradaki dal `next/image`'a gecer; cagiran taraf degismez.
 */

/** Gercek gorsel kaynagi (henuz yok → daima null). Tek entegrasyon kancasi. */
export function productImageSrc(handle: string): string | null {
  // TODO(todo.md P0): images[] public DTO'ya eklenince handle → ilk gorsel URL'i.
  void handle;
  return null;
}

export function ProductMedia({
  handle,
  title,
  imageUrl,
  className,
  priority = false,
  alt,
  fit = "cover",
}: {
  handle: string;
  title: string;
  /**
   * Adim 3 — Opsiyonel gercek gorsel URL'i (cagiran taraf verirse). Verilmezse
   * merkezi kancaya (`productImageSrc`) duser; o da null oldugundan (bkz. todo.md
   * P0) yer tutucu gosterilir. Gorsel altyapisi gelince cagiran taraf DEGISMEZ.
   */
  imageUrl?: string | null;
  className?: string;
  /**
   * TODO-156B (ANALIZ §10/18) — Ilk gorunur satir (LCP) icin eager + yuksek oncelik;
   * aksi lazy. next/image yerine goreli /media/* rewrite ile native <img> kullanilir
   * (tum vitrin tutarli; remotePatterns config gerektirmez — bkz. ANALIZ TD next/image).
   */
  priority?: boolean;
  /** Ozel alt metni (yoksa title). */
  alt?: string;
  /**
   * Gorselin cerceveye oturma bicimi. Kartlar/kucuk yuzeyler `cover` (kirparak
   * doldurur); PDP ana gorseli `contain` (kirpmadan sigdirir — bkz. product-gallery).
   */
  fit?: "cover" | "contain";
}) {
  const src = imageUrl ?? productImageSrc(handle);
  const label = alt ?? title;
  const monogram = (title.trim()[0] ?? "·").toLocaleUpperCase("tr-TR");

  // Gercek gorsel yolu (drop-in): src cozulur cozulmez kapak gorseli gosterilir.
  // Tek degisim noktasi burasidir; kart/cagiran taraf ayni kalir.
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        loading={priority ? "eager" : "lazy"}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fetchPriority React 19'da desteklenir; tip henuz dar.
        {...({ fetchPriority: priority ? "high" : "auto" } as any)}
        decoding="async"
        className={cn(
          "h-full w-full",
          fit === "contain" ? "object-contain" : "object-cover",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn("flex h-full w-full items-center justify-center bg-surface-muted", className)}
      role="img"
      aria-label={label}
    >
      <span
        aria-hidden
        className="select-none font-serif text-5xl font-normal text-line-strong sm:text-6xl"
      >
        {monogram}
      </span>
    </div>
  );
}

/**
 * TODO-165B (ADR — product-card image fit standard) — Ortak ürün medya ÇERÇEVESİ.
 *
 * `ProductMedia` yalnız görseli doldurur (h-full w-full); aspect-ratio + fit + iç boşluk + nötr
 * zemin kararı bugüne kadar her tüketicide KOPYALANIYORDU ve kartlar `cover` ile aşırı zoom/crop
 * yapıyordu (blocker 6). Bu primitive o kararı TEK YERDE toplar: `variant`'a göre aspect/fit/pad/bg.
 *
 * Kural: ürün kartları `contain` (kırpma yok, görsel merkezli, nötr zemin, kontrollü padding).
 * Hero/banner bu primitive'i KULLANMAZ. Overlay'ler (rozet vb.) `children` olarak geçer; görsel-özel
 * hover efekti `mediaClassName` ile img'e uygulanır (çerçeve overflow-hidden ile taşmayı keser).
 */
export type ProductMediaFrameVariant =
  | "product-card"
  | "gallery-main"
  | "gallery-thumbnail"
  | "variant-card"
  | "line-thumbnail";

const FRAME_CONFIG: Record<
  ProductMediaFrameVariant,
  { aspect: string; fit: "cover" | "contain"; pad: string; bg: string }
> = {
  // Kart: kırpmadan sığdır + nötr zemin + kontrollü iç boşluk.
  "product-card": { aspect: "aspect-[4/5]", fit: "contain", pad: "p-2 sm:p-3", bg: "bg-surface" },
  // PDP ana görseli: 4/5 (moda portresi), contain (kırpma yok), güvenli iç boşluk (F9 galeri).
  "gallery-main": { aspect: "aspect-[4/5]", fit: "contain", pad: "p-4 sm:p-6", bg: "bg-surface" },
  // Thumbnail: küçük net önizleme (cover kabul edilebilir).
  "gallery-thumbnail": { aspect: "aspect-square", fit: "cover", pad: "", bg: "bg-surface-muted" },
  // Varyant kartı (renk görseli): kompakt, contain.
  "variant-card": { aspect: "aspect-square", fit: "contain", pad: "p-1", bg: "bg-surface" },
  // TD-173 — Sepet/sipariş/wishlist satır thumbnail'i: kare, contain (kırpma yok), nötr zemin,
  // ince iç boşluk, tutarlı placeholder. Layout shift yok (aspect sabit). Tüm satır-yüzeyleri paylaşır.
  "line-thumbnail": { aspect: "aspect-square", fit: "contain", pad: "p-1.5", bg: "bg-surface-muted" },
};

export function ProductMediaFrame({
  variant,
  handle,
  title,
  imageUrl,
  alt,
  priority = false,
  className,
  mediaClassName,
  children,
}: {
  variant: ProductMediaFrameVariant;
  handle: string;
  title: string;
  imageUrl?: string | null;
  alt?: string;
  priority?: boolean;
  /** Çerçeve (dış kutu) ek sınıfları — kenarlık vb. */
  className?: string;
  /** Görsele (img) uygulanan ek sınıflar — ör. hover zoom. */
  mediaClassName?: string;
  /** Çerçeve içi mutlak-konumlu overlay'ler (rozet, hover katmanı). */
  children?: ReactNode;
}) {
  const cfg = FRAME_CONFIG[variant];
  return (
    <div className={cn("relative overflow-hidden", cfg.aspect, cfg.bg, cfg.pad, className)}>
      <ProductMedia
        handle={handle}
        title={title}
        imageUrl={imageUrl}
        alt={alt}
        priority={priority}
        fit={cfg.fit}
        className={mediaClassName}
      />
      {children}
    </div>
  );
}
