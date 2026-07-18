// TODO-151A (ADR-075) — Fiyatlandırma çalışma alanı semantik token sınıfları.
//
// Bileşenler bu adlandırılmış rollere bağlanır; ham `text-white/xx` / `bg-white/[0.0x]`
// sihirli değerleri KULLANMAZ. Böylece koyu/açık tema tek noktadan (globals.css
// `.pricing-workspace` değişkenleri) türetilir ve kontrast merkezî kalır.

/** Fiyatlandırma çalışma alanının kök sınıfı; token kapsamını açar. */
export const PRICING_ROOT = "pricing-workspace";

export const pw = {
  // Metin
  ink: "text-[color:var(--pw-ink)]",
  muted: "text-[color:var(--pw-ink-muted)]",
  faint: "text-[color:var(--pw-ink-faint)]",
  accent: "text-[color:var(--pw-accent)]",
  // Yüzeyler
  surface: "bg-[color:var(--pw-surface)]",
  surfaceRaised: "bg-[color:var(--pw-surface-raised)]",
  inputBg: "bg-[color:var(--pw-input-bg)]",
  hover: "hover:bg-[color:var(--pw-hover)]",
  selected: "bg-[color:var(--pw-selected)]",
  // Çizgiler
  line: "border-[color:var(--pw-line)]",
  lineStrong: "border-[color:var(--pw-line-strong)]",
  // Durum metni
  success: "text-[color:var(--pw-success)]",
  warning: "text-[color:var(--pw-warning)]",
  danger: "text-[color:var(--pw-danger)]",
  // Durum yüzeyi
  successBg: "bg-[color:var(--pw-success-bg)]",
  warningBg: "bg-[color:var(--pw-warning-bg)]",
  dangerBg: "bg-[color:var(--pw-danger-bg)]",
  accentBg: "bg-[color:var(--pw-accent-soft)]",
} as const;
