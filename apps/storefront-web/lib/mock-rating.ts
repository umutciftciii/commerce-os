/**
 * MOCK: Ürün puanı — gerçek değerlendirme verisi yok (bkz. todo.md "Ürün puanlama
 * & yorumlar"). Prisma'da `ProductReview` modeli ve public agregasyon ucu yok.
 *
 * Handle'dan DETERMINISTIK türetim (SSR/CSR tutarlı, rastgele değil): aynı ürün
 * her yerde (Home kartı, PLP quick-view, PDP başlığı) AYNI yıldız/sayıyı gösterir.
 * TEK KAYNAK: Home kartı ve PDP bu helper'ı paylaşır — mock stratejisi iki yerde
 * ayrışmaz. Gerçek veri gelince yalnızca çağıran taraf gerçek ortalamaya geçer.
 */
export function mockRating(handle: string): { value: number; count: number } {
  let h = 0;
  for (let i = 0; i < handle.length; i += 1) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  const value = 4 + ((h % 11) / 10); // 4.0 .. 5.0
  const count = 12 + (h % 240); // 12 .. 251
  return { value: Math.min(5, value), count };
}
