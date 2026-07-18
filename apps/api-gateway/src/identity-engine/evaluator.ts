/**
 * TODO-150 (ADR-073) — Identity Management Engine · EVALUATOR (SAF ÇEKİRDEK).
 *
 * Derlenmiş bir pattern'ı (parser.ts) tek bir varyantın `EvaluationContext`'ine karşı değerlendirip
 * çözülmüş string'i üretir. SAF: Prisma / HTTP / Date / Math.random / process.env BİLMEZ. Tüm semantik
 * girdiler (SEQ değeri, preferLabel, attribute değerleri) BAĞLAMDAN gelir → determinizm + izole test.
 *
 * İki mod:
 *  - identifier modu (`preferLabel=false`): SKU/barcode. Token'lar makine değeri (`value`) çözer ve
 *    UPPER-CASE normalize edilir (`RED`, `S`). PRODUCT=slug, CATEGORY=code.
 *  - title modu (`preferLabel=true`): başlık. Token'lar insan etiketi (`label`) çözer, normalize YOK.
 *    PRODUCT=ad, CATEGORY=ad.
 *
 * Eksik token (varyantta o attribute yoksa / kategori yoksa) → değeri "" (boş) olur ve `missing`
 * listesine eklenir; değerlendirme çökmeden devam eder (preview satırı tanısal gösterir).
 */

import type { CompiledPattern } from "./parser.js";

export interface ContextAttributeValue {
  /** Makine değeri (AttributeOption.value), identifier modunda kullanılır. */
  value: string;
  /** İnsan etiketi (AttributeOption.label), title modunda kullanılır. */
  label: string;
}

export interface EvaluationContext {
  product: {
    /** identifier modu: slug; title modu: ad. */
    slug: string;
    name: string;
  };
  category: {
    code: string;
    name: string;
  } | null;
  /** attribute code → çözülmüş option değeri (yalnız bu varyantta seçili olan eksenler). */
  attributes: Map<string, ContextAttributeValue>;
  /** Bu satırın 1-tabanlı SEQ değeri (servis, kanonik sırada atar). */
  seq: number;
  /** true → title modu (label); false → identifier modu (value + upper). */
  preferLabel: boolean;
}

export interface EvaluationResult {
  value: string;
  /** Çözülemeyen token'lar (örn. "category", "attribute:color"); tanısal — hata değil. */
  missing: string[];
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Derlenmiş pattern'ı bir bağlama karşı değerlendirir. Saf: bağlamı ve pattern'ı mutasyona uğratmaz. */
export function evaluatePattern(
  pattern: CompiledPattern,
  ctx: EvaluationContext,
): EvaluationResult {
  const missing: string[] = [];
  let out = "";

  for (const seg of pattern.segments) {
    switch (seg.kind) {
      case "literal":
        out += seg.value;
        break;
      case "product":
        out += ctx.preferLabel ? ctx.product.name : normalizeIdentifier(ctx.product.slug);
        break;
      case "category":
        if (!ctx.category) {
          missing.push("category");
          break;
        }
        out += ctx.preferLabel ? ctx.category.name : normalizeIdentifier(ctx.category.code);
        break;
      case "attribute": {
        const resolved = ctx.attributes.get(seg.code);
        if (!resolved) {
          missing.push(`attribute:${seg.code}`);
          break;
        }
        out += ctx.preferLabel ? resolved.label : normalizeIdentifier(resolved.value);
        break;
      }
      case "seq":
        out += String(ctx.seq).padStart(seg.padding, "0");
        break;
    }
  }

  return { value: out, missing };
}
