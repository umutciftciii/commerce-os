import type { ThemeDocument } from "./schema.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Accessibility — WCAG 2.1 Contrast Publish Gate (TODO-164A · ADR-230)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Builder ile üretilen bir tema PUBLISH edilmeden önce kritik metin/zemin
 * çiftlerinin WCAG 2.1 kontrast oranı denetlenir. SAF modül (yalnız renk
 * matematiği); throw ETMEZ.
 *
 *  - KRİTİK çift (gövde metni / zemin) < 4.5:1 → ERROR → publish REDDEDİLİR.
 *  - < 3:1 → büyük metin için bile başarısız → ERROR.
 *  - 4.5–7 arası → AAA sağlanmadı → WARNING (publish engellemez).
 *  - Hesaplanamayan renk (parse edilemeyen; ör. named/var()) → çift ATLANIR
 *    (fail-open DEĞİL: bilinen kritik çiftler hex/rgb ise mutlaka denetlenir;
 *    preset paletleri hep hex verir).
 *
 * Renk kaynağı: `document.tokens` primitive paleti (semantic `{ref}` çözmeye
 * gerek yok — kritik çiftler doğrudan primitive'lerdir).
 */

export type ContrastSeverity = "ERROR" | "WARNING";

export interface ContrastPair {
  /** Okunur çift adı (ör. "Gövde metni / Zemin"). */
  label: string;
  /** Ön plan token yolu (audit). */
  fg: string;
  /** Arka plan token yolu (audit). */
  bg: string;
  /** WCAG AA eşiği (4.5 normal, 3 büyük/UI). */
  threshold: number;
  /**
   * Publish'i KESİN engeller mi? Varsayılan true (gövde metni okunabilirliği HARD
   * gate). Aksan-sürücülü öğeler (bağlantı) `false`: alt-eşik → ERROR değil WARNING
   * (altı-çizili afordans + marka rengi tercihi; shipped preset'ler yayınlanabilir
   * kalır). Uyarı yine açıkça gösterilir.
   */
  blocking?: boolean;
}

export interface ContrastIssue {
  label: string;
  severity: ContrastSeverity;
  /** Hesaplanan oran (1 ondalık). */
  ratio: number;
  threshold: number;
}

export interface ContrastResult {
  ok: boolean;
  issues: ContrastIssue[];
}

/** `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` veya `rgb()/rgba()` → [r,g,b] (0-255) veya null. */
export function parseRgb(input: string): [number, number, number] | null {
  const v = input.trim().toLowerCase();
  // Hex
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    } else {
      h = h.slice(0, 6);
    }
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b];
  }
  // rgb()/rgba() — yalnız sayısal kanallar (yüzde/renk-fonksiyon değil).
  const m = /^rgba?\(([^()]+)\)$/i.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    if (parts.length !== 3) return null;
    const nums = parts.map((p) => (p.endsWith("%") ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p)));
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return [nums[0], nums[1], nums[2]] as [number, number, number];
  }
  return null;
}

/** sRGB kanalı → doğrusal ışık (WCAG). */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance (WCAG 2.1). */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** İki renk arası WCAG kontrast oranı (1–21). Parse edilemezse null. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b) return null;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

/** Belgeden `tokens.<grup>.<anahtar>` primitive değerini okur. */
function tokenValue(doc: ThemeDocument, path: string): string | undefined {
  const [group, key] = path.split(".");
  const bag = (doc.tokens as unknown as Record<string, Record<string, unknown>>)[group];
  const raw = bag?.[key];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Denetlenecek KRİTİK çiftler (primitive token yolları). Zemin = surface.background;
 * yüzey kartları = surface.surface. Buton ön/arka = text.inverse / brand.primary.
 */
export const CRITICAL_CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Normal gövde metni → WCAG AA 4.5:1.
  { label: "Gövde metni / Zemin", fg: "text.primary", bg: "surface.background", threshold: 4.5 },
  { label: "Gövde metni / Yüzey", fg: "text.primary", bg: "surface.surface", threshold: 4.5 },
  { label: "İkincil metin / Zemin", fg: "text.secondary", bg: "surface.background", threshold: 4.5 },
  // Bağlantı = aksan-sürücülü (altı-çizili afordans); alt-eşik → WARNING, publish'i
  // ENGELLEMEZ (shipped preset'lerin vivid marka linki yayınlanabilir kalır).
  { label: "Bağlantı / Zemin", fg: "text.link", bg: "surface.background", threshold: 4.5, blocking: false },
  // Buton etiketi = büyük/kalın UI metni → WCAG AA UI/large-text eşiği 3:1.
  { label: "Buton metni / Buton zemini", fg: "text.inverse", bg: "brand.primary", threshold: 3 },
];

/**
 * Bir belgenin kritik kontrastını denetler. AAA hedefi (7:1) sağlanmazsa WARNING;
 * AA (threshold) sağlanmazsa ERROR. Renk hesaplanamazsa çift atlanır.
 */
export function checkContrast(doc: ThemeDocument): ContrastResult {
  const issues: ContrastIssue[] = [];
  for (const pair of CRITICAL_CONTRAST_PAIRS) {
    const fg = tokenValue(doc, pair.fg);
    const bg = tokenValue(doc, pair.bg);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio === null) continue;
    const rounded = Math.round(ratio * 10) / 10;
    if (ratio < pair.threshold) {
      // blocking:false → aksan/link öğesi: alt-eşik ERROR değil WARNING.
      const severity: ContrastSeverity = pair.blocking === false ? "WARNING" : "ERROR";
      issues.push({ label: pair.label, severity, ratio: rounded, threshold: pair.threshold });
    } else if (ratio < 7) {
      // AA geçti, AAA geçmedi — bilgilendirici uyarı.
      issues.push({ label: pair.label, severity: "WARNING", ratio: rounded, threshold: 7 });
    }
  }
  const ok = !issues.some((i) => i.severity === "ERROR");
  return { ok, issues };
}

/** Yalnız ERROR sorunları (publish'i engelleyenler). */
export function contrastErrors(result: ContrastResult): ContrastIssue[] {
  return result.issues.filter((i) => i.severity === "ERROR");
}
