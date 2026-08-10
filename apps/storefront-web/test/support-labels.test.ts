import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import {
  actorLabel,
  answerSummaryText,
  statusLabel,
  supportErrorMessage,
  topicLabel,
  warrantyText,
} from "../lib/support/labels";

/**
 * TODO-177 (ADR-289) Faz D — Müşteriye ASLA raw enum / sentinel kod / teknik detay sızmaz
 * (gate şartı). Bu saf resolver'lar enum ve gateway hata kodlarını i18n insan-okur metnine
 * eşler; bilinmeyen kod → generic mesaj. Warranty metni formatDate inject edilerek deterministik.
 */

const t = getDictionary("tr").storefront.account.support;
const fmt = () => "10.08.2026";

describe("enum → label", () => {
  it("topic/status/actor insan-okur etiket döner (raw enum değil)", () => {
    expect(topicLabel("PRODUCT_NOT_WORKING", t)).toBe("Ürün çalışmıyor");
    expect(statusLabel("WAITING_STORE", t)).toBe("Mağaza yanıtı bekleniyor");
    expect(actorLabel("STORE_ADMIN", t)).toBe("Mağaza");
    // hiçbiri ham enum döndürmemeli
    expect(topicLabel("PRODUCT_NOT_WORKING", t)).not.toContain("PRODUCT_NOT_WORKING");
    expect(statusLabel("WAITING_STORE", t)).not.toContain("WAITING_STORE");
  });
});

describe("supportErrorMessage", () => {
  it("bilinen sentinel kodu müşteri mesajına eşler", () => {
    expect(supportErrorMessage("ORDER_LINE_NOT_FOUND", t)).toBe(t.errors.ORDER_LINE_NOT_FOUND);
    expect(supportErrorMessage("REOPEN_WINDOW_EXPIRED", t)).toBe(t.errors.REOPEN_WINDOW_EXPIRED);
  });
  it("bilinmeyen kod veya null → generic (ham kod sızmaz)", () => {
    expect(supportErrorMessage("SOME_INTERNAL_500", t)).toBe(t.errors.generic);
    expect(supportErrorMessage(null, t)).toBe(t.errors.generic);
    expect(supportErrorMessage("SOME_INTERNAL_500", t)).not.toContain("SOME_INTERNAL_500");
  });
});

describe("warrantyText", () => {
  it("garanti aktif → bitiş tarihiyle 'kapsamında' mesajı", () => {
    const text = warrantyText(
      { warrantyEndsAt: "2026-08-10T00:00:00.000Z", anchorSource: "SHIPMENT_DELIVERED", inWarranty: true },
      t,
      fmt,
    );
    expect(text).toContain("10.08.2026");
    expect(text).toContain("kapsamında");
    expect(text).not.toContain("SHIPMENT_DELIVERED");
  });
  it("garanti dolmuş → 'doldu' mesajı ama yine talep açılabilir (CTA kapanmaz)", () => {
    const text = warrantyText(
      { warrantyEndsAt: "2026-08-10T00:00:00.000Z", anchorSource: "ORDER_CREATED", inWarranty: false },
      t,
      fmt,
    );
    expect(text).toContain("doldu");
    expect(text).toContain("10.08.2026");
  });
  it("garanti bilgisi yok (warrantyMonths null) → unknown metni, dead-end yok", () => {
    const text = warrantyText(
      { warrantyEndsAt: null, anchorSource: "NONE", inWarranty: null },
      t,
      fmt,
    );
    expect(text).toBe(t.warranty.unknown);
  });
});

describe("answerSummaryText — guided cevap özeti (raw key leak yok)", () => {
  it("BOOLEAN → Evet/Hayır", () => {
    expect(answerSummaryText({ questionType: "BOOLEAN", value: { boolean: true } }, t)).toBe(t.wizard.booleanYes);
    expect(answerSummaryText({ questionType: "BOOLEAN", value: { boolean: false } }, t)).toBe(t.wizard.booleanNo);
  });
  it("SHORT_TEXT/LONG_TEXT → metin değeri", () => {
    expect(answerSummaryText({ questionType: "SHORT_TEXT", value: { text: "kısa not" } }, t)).toBe("kısa not");
    expect(answerSummaryText({ questionType: "LONG_TEXT", value: { text: "uzun açıklama" } }, t)).toBe("uzun açıklama");
  });
  it("SELECT → null (option KEY'i asla gösterilmez; graph yok, label türetilemez)", () => {
    expect(answerSummaryText({ questionType: "SINGLE_SELECT", value: { optionKeys: ["opt_broken"] } }, t)).toBeNull();
    expect(answerSummaryText({ questionType: "MULTI_SELECT", value: { optionKeys: ["opt_a", "opt_b"] } }, t)).toBeNull();
  });
});
