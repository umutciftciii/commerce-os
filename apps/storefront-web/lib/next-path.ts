/**
 * F3B.3 — `next` yonlendirme parametresi guvenligi. Yalnizca uygulama-ici mutlak
 * yollara (tek "/" ile baslayan; "//" veya sema iceren DEGIL) izin verilir; aksi
 * halde guvenli varsayilana duser. Acik yonlendirme (open redirect) onlenir.
 */
export function safeNextPath(value: string | undefined, fallback = "/account"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
