/**
 * TODO-177 (ADR-289) Faz D — Ek (attachment) MIME kabul + önizleme türü saf mantığı
 * (istemci-güvenli). PhotoUpload paylaşılan bileşeni `accept` prop'u ile genişletildi:
 * mevcut İADE tüketicisi default GÖRSEL kümesinde kalır (regresyon yok); DESTEK akışı
 * GÖRSEL + PDF geçer. Kümeler gateway upload kabulüyle (JPEG/PNG/WebP + PDF, 5 MiB) hizalı.
 */

/** Gateway görsel pipeline'ı (ADR-269/ADR-289): sharp/webp'e normalize edilen türler. */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Destek eki: görsel + PDF (PDF sharp'tan geçmez, olduğu gibi private saklanır). */
export const SUPPORT_ATTACHMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"] as const;

/** Verilen MIME türü kabul kümesinde mi? */
export function isTypeAccepted(type: string, accept: readonly string[]): boolean {
  return accept.includes(type);
}

/** Önizleme türü: PDF blob'u <img> ile gösterilemez → dosya göstergesi ("pdf"). */
export function attachmentPreviewKind(type: string): "image" | "pdf" {
  return type === "application/pdf" ? "pdf" : "image";
}
