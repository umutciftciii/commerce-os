import { describe, expect, it } from "vitest";
import { ticketPanelMode } from "../lib/support/ticket";

/**
 * TODO-177 (ADR-289) Faz D — Ticket detay panel modu (reply/reopen/expired/closed) saf mantığı.
 * Reopen YALNIZ RESOLVED + owner + 7 gün içinde (canReopen backend-otoriter). CLOSED reopen
 * EDİLEMEZ; süre geçtiyse yeni talep yönlendirmesi. Aktif ticket'ta müşteri yanıt yazar. İç SLA
 * cycle detayları müşteriye expose EDİLMEZ; UI yalnız aktif durum + bu modu görür.
 */
describe("ticketPanelMode", () => {
  it("aktif durumlar (OPEN/WAITING_*) → müşteri yanıt formu ('reply')", () => {
    expect(ticketPanelMode("OPEN", false)).toBe("reply");
    expect(ticketPanelMode("WAITING_STORE", false)).toBe("reply");
    expect(ticketPanelMode("WAITING_CUSTOMER", false)).toBe("reply");
  });

  it("RESOLVED + canReopen (7 gün içinde owner) → 'reopen'", () => {
    expect(ticketPanelMode("RESOLVED", true)).toBe("reopen");
  });

  it("RESOLVED + !canReopen (pencere geçti) → 'expired' (yeni talep yönlendirmesi)", () => {
    expect(ticketPanelMode("RESOLVED", false)).toBe("expired");
  });

  it("CLOSED → 'closed' (reopen GÖSTERİLMEZ; yeni talep)", () => {
    expect(ticketPanelMode("CLOSED", false)).toBe("closed");
    // CLOSED asla reopen'a düşmez (canReopen true gelse bile — savunma)
    expect(ticketPanelMode("CLOSED", true)).toBe("closed");
  });
});
