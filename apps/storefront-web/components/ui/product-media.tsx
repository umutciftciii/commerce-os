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

/** handle → stabil, kucuk indeks (deterministik yer tutucu tonu icin). */
function hashIndex(handle: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < handle.length; i += 1) {
    h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

// Sicak notr yer tutucu tonlari (paletle uyumlu; gurultusuz).
const PLACEHOLDER_TONES = [
  "from-[#efece6] to-[#e3ded4]",
  "from-[#eceae6] to-[#dcd7cd]",
  "from-[#f0ece4] to-[#e6ddd0]",
  "from-[#eae7e2] to-[#d8d2c7]",
] as const;

export function ProductMedia({
  handle,
  title,
  imageUrl,
  className,
  priority = false,
  alt,
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
}) {
  const src = imageUrl ?? productImageSrc(handle);
  const label = alt ?? title;
  const monogram = (title.trim()[0] ?? "·").toLocaleUpperCase("tr-TR");
  const tone = PLACEHOLDER_TONES[hashIndex(handle, PLACEHOLDER_TONES.length)];

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
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-gradient-to-br",
        tone,
        className,
      )}
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
