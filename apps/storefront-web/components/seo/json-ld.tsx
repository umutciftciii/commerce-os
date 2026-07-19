/**
 * TODO-156D (brief §14) — JSON-LD script render'ı. Builder'ların (lib/seo/json-ld) ürettiği düz nesneyi
 * `<script type="application/ld+json">` olarak basar. `<` → `<` kaçışı ile script-break/XSS engellenir.
 * Sunucu bileşeni (island değil): SSR ile head/body'de statik gömülür, hidrasyon gerektirmez.
 */

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
