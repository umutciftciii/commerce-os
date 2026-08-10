/**
 * TODO-177 (ADR-289) Faz D — Ticket detay panel modu saf mantığı (istemci-güvenli).
 * Reopen otoritesi SUNUCUDADIR (`canReopen` = RESOLVED + owner + 7 gün içinde). UI yalnız
 * hangi paneli göstereceğini seçer; iç SLA cycle detayları müşteriye expose edilmez.
 *
 * - reply:   aktif ticket (OPEN/WAITING_*) → müşteri yanıt formu.
 * - reopen:  RESOLVED + canReopen → "Talebi yeniden aç".
 * - expired: RESOLVED ama pencere geçti → yeni talep yönlendirmesi.
 * - closed:  CLOSED → reopen GÖSTERİLMEZ; yeni talep yönlendirmesi.
 */
import type { SupportTicketStatusDto } from "@commerce-os/contracts";

export type TicketPanelMode = "reply" | "reopen" | "expired" | "closed";

export function ticketPanelMode(status: SupportTicketStatusDto, canReopen: boolean): TicketPanelMode {
  if (status === "CLOSED") return "closed";
  if (status === "RESOLVED") return canReopen ? "reopen" : "expired";
  return "reply";
}
