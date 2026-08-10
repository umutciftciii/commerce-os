import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { CustomerSupportTicketDetail } from "@commerce-os/contracts";
import { SupportTicketDetailView } from "../components/account/support/support-ticket-detail-view";

/**
 * TODO-177 (ADR-289) Faz D — Ticket detay statik görünümü: bağlam, guided cevaplar, yazışma ve
 * ekler doğru render eder; HİÇBİR ham enum/teknik anahtar (WAITING_STORE, PRODUCT_NOT_WORKING,
 * SINGLE_SELECT, opt_broken…) müşteriye sızmaz (gate). Ekler auth-gate'li proxy href'i kullanır.
 */

const s = getDictionary("tr").storefront.account.support;

const TICKET: CustomerSupportTicketDetail = {
  ticketNumber: "S000007",
  status: "WAITING_STORE",
  topic: "PRODUCT_NOT_WORKING",
  productTitle: "Kablosuz Kulaklık",
  variantTitle: "Siyah",
  orderNumber: "OS-42",
  createdAt: "2026-08-10T09:00:00.000Z",
  lastActivityAt: "2026-08-10T10:00:00.000Z",
  resolvedAt: null,
  reopenCount: 0,
  canReopen: false,
  warranty: { warrantyEndsAt: "2027-08-10T00:00:00.000Z", anchorSource: "SHIPMENT_DELIVERED", inWarranty: true },
  suggestedResolutionText: "Cihazı 10 saniye basılı tutun.",
  answers: [
    { questionKey: "q_type", questionPrompt: "Sorun nedir?", questionType: "SINGLE_SELECT", value: { optionKeys: ["opt_broken"] }, sortOrder: 0 },
    { questionKey: "q_tried", questionPrompt: "Yeniden başlattınız mı?", questionType: "BOOLEAN", value: { boolean: true }, sortOrder: 1 },
    { questionKey: "q_note", questionPrompt: "Ek not", questionType: "SHORT_TEXT", value: { text: "Ses gelmiyor" }, sortOrder: 2 },
  ],
  messages: [
    {
      id: "m1",
      actorType: "CUSTOMER",
      body: "Hâlâ çalışmıyor",
      createdAt: "2026-08-10T10:00:00.000Z",
      attachments: [{ id: "att-1", type: "PHOTO", url: "/gateway/att-1" }],
    },
  ],
  attachments: [{ id: "att-esc", type: "PDF", url: "/gateway/att-esc" }],
  sla: {
    cycle: 1,
    firstResponseDueAt: "2026-08-11T09:00:00.000Z",
    resolutionDueAt: "2026-08-13T09:00:00.000Z",
    firstResponseState: "INSIDE",
    resolutionState: "INSIDE",
  },
};

function render() {
  return renderToStaticMarkup(
    <SupportTicketDetailView ticket={TICKET} t={s} locale="tr" attachmentHref={(id) => `/account/support/S000007/attachments/${id}`} />,
  );
}

describe("SupportTicketDetailView", () => {
  it("bağlamı insan-okur etiketlerle gösterir", () => {
    const html = render();
    expect(html).toContain("S000007");
    expect(html).toContain("Kablosuz Kulaklık");
    expect(html).toContain("Siyah");
    expect(html).toContain("OS-42");
    expect(html).toContain("Ürün çalışmıyor"); // topic label
    expect(html).toContain("Mağaza yanıtı bekleniyor"); // status label
  });

  it("önerilen çözüm + garanti bilgisini gösterir", () => {
    const html = render();
    expect(html).toContain("Cihazı 10 saniye basılı tutun.");
    expect(html).toContain("kapsamında"); // warranty aktif metni
  });

  it("guided cevapları özetler: BOOLEAN/TEXT değeri görünür, SELECT KEY'i GİZLİ", () => {
    const html = render();
    expect(html).toContain("Sorun nedir?"); // select prompt görünür
    expect(html).toContain("Ses gelmiyor"); // text değeri
    expect(html).toContain("Evet"); // boolean değeri
    expect(html).not.toContain("opt_broken"); // option KEY sızmaz
  });

  it("yazışmayı gönderen etiketiyle gösterir; ekler proxy href'i kullanır", () => {
    const html = render();
    expect(html).toContain("Hâlâ çalışmıyor");
    expect(html).toContain("Siz"); // CUSTOMER actor label
    expect(html).toContain('href="/account/support/S000007/attachments/att-1"');
    expect(html).toContain('href="/account/support/S000007/attachments/att-esc"');
    expect(html).not.toContain("/gateway/att-1"); // ham gateway url sızmaz
  });

  it("hiçbir ham enum/teknik anahtar sızmaz", () => {
    const visible = render().replace(/data-testid="[^"]*"/g, "");
    expect(visible).not.toContain("WAITING_STORE");
    expect(visible).not.toContain("PRODUCT_NOT_WORKING");
    expect(visible).not.toContain("SINGLE_SELECT");
    expect(visible).not.toContain("SHIPMENT_DELIVERED");
  });
});
