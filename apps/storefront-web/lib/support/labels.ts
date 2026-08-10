/**
 * TODO-177 (ADR-289) Faz D — Ürün Desteği enum→etiket ve sentinel-hata→müşteri-mesajı
 * saf resolver'ları (istemci-güvenli). GATE ŞARTI: müşteriye ASLA ham enum / gateway
 * sentinel kodu / teknik detay (warrantyAnchorSource, internal 500 vb.) gösterilmez.
 * Bilinmeyen/eşleşmeyen kod → generic mesaja düşer. Warranty metni `formatDate` inject
 * edilerek deterministik üretilir; label modülü tarih formatlamaz (saf kalır).
 */
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type {
  SupportActorTypeDto,
  SupportResolveResponse,
  SupportTicketStatusDto,
  SupportTopicDto,
} from "@commerce-os/contracts";

export type SupportDict = StorefrontDictionary["account"]["support"];
type SupportWarranty = SupportResolveResponse["warranty"];

export function topicLabel(topic: SupportTopicDto, t: SupportDict): string {
  return t.topics[topic];
}

export function statusLabel(status: SupportTicketStatusDto, t: SupportDict): string {
  return t.statuses[status];
}

export function actorLabel(actor: SupportActorTypeDto, t: SupportDict): string {
  return t.actors[actor];
}

/** Gateway sentinel kodu → müşteri mesajı. Bilinmeyen/null → generic (ham kod sızmaz). */
export function supportErrorMessage(code: string | null, t: SupportDict): string {
  if (code && code in t.errors) {
    return t.errors[code as keyof SupportDict["errors"]];
  }
  return t.errors.generic;
}

/**
 * Warranty özeti (müşteri-güvenli). anchorSource ASLA gösterilmez. Süresi dolmuş garanti
 * talebi bloklamaz — yalnız "doldu" bilgisi verir. warrantyMonths null (endsAt yok) →
 * unknown metni; dead-end üretmez.
 */
export function warrantyText(
  warranty: SupportWarranty,
  t: SupportDict,
  formatDate: (iso: string) => string,
): string {
  if (warranty.warrantyEndsAt && warranty.inWarranty === true) {
    return format(t.warranty.active, { date: formatDate(warranty.warrantyEndsAt) });
  }
  if (warranty.warrantyEndsAt && warranty.inWarranty === false) {
    return format(t.warranty.expired, { date: formatDate(warranty.warrantyEndsAt) });
  }
  return t.warranty.unknown;
}
