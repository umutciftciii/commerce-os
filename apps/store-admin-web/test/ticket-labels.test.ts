import { describe, expect, it } from "vitest";
import {
  slaStateBadge,
  supportActorLabel,
  supportStatusKeys,
  supportStatusLabel,
  supportStatusTone,
  supportTopicKeys,
  supportTopicLabel,
} from "../lib/client/ticket-labels";

/**
 * TODO-177 (ADR-289) Faz E — Store Admin Ürün Desteği etiketleri. TEK KURAL: ham enum ASLA UI'a
 * çıkmaz; liste + detay + filtre tek kaynaktan beslenir. SLA rozeti INSIDE/DUE_TODAY/OVERDUE/DONE →
 * insan-okur label + tone (renk-dışı metin garanti).
 */
describe("ticket-labels — enum → label (raw enum leak yok)", () => {
  it("status insan-okur (tr/en)", () => {
    expect(supportStatusLabel("WAITING_STORE", true)).toBe("Mağaza yanıtı bekleniyor");
    expect(supportStatusLabel("WAITING_STORE", false)).toBe("Waiting for store reply");
    expect(supportStatusLabel("WAITING_STORE", true)).not.toContain("WAITING_STORE");
  });
  it("topic insan-okur", () => {
    expect(supportTopicLabel("PRODUCT_NOT_WORKING", true)).toBe("Ürün çalışmıyor");
    expect(supportTopicLabel("PRODUCT_NOT_WORKING", true)).not.toContain("PRODUCT_NOT_WORKING");
  });
  it("actor insan-okur", () => {
    expect(supportActorLabel("CUSTOMER", true)).toBe("Müşteri");
    expect(supportActorLabel("STORE_ADMIN", true)).toBe("Mağaza");
    expect(supportActorLabel("SYSTEM", true)).toBe("Sistem");
  });
  it("bilinmeyen kod → defansif humanize (ham SNAKE_CASE değil)", () => {
    expect(supportStatusLabel("SOME_NEW_STATUS", true)).toBe("Some New Status");
  });
});

describe("ticket-labels — SLA badge", () => {
  it("her SlaStateKind için label + tone", () => {
    expect(slaStateBadge("OVERDUE", true)).toEqual({ label: "Gecikti", tone: "danger" });
    expect(slaStateBadge("DUE_TODAY", true)).toEqual({ label: "Bugün doluyor", tone: "warning" });
    expect(slaStateBadge("INSIDE", true)).toEqual({ label: "SLA içinde", tone: "neutral" });
    expect(slaStateBadge("DONE", true)).toEqual({ label: "Tamamlandı", tone: "success" });
  });
});

describe("ticket-labels — filtre kaynağı + tone", () => {
  it("status/topic anahtarları map'ten türetilir", () => {
    expect(supportStatusKeys).toContain("OPEN");
    expect(supportStatusKeys).toContain("CLOSED");
    expect(supportTopicKeys).toContain("WARRANTY_SERVICE");
  });
  it("status tone", () => {
    expect(supportStatusTone("OVERDUE" as never)).toBe("neutral"); // bilinmeyen → neutral
    expect(supportStatusTone("RESOLVED")).toBe("success");
    expect(supportStatusTone("OPEN")).toBe("warning");
  });
});
