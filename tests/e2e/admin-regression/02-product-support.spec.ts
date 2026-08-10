import { test, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";

/**
 * TODO-177 (ADR-289) Faz F — Store Admin Ürün Desteği regression. Gerçek UI: inbox → detail →
 * bağlam/SLA render → kendime ata → admin yanıtı. Seeded RESOLVED ticket (S900001) kullanılır;
 * assign/reply status'u DEĞİŞTİRMEZ (RESOLVED korunur → storefront reopen spec'iyle çakışmaz).
 * Server-authoritative: her mutation sonrası UI sonucu doğrulanır (fixed sleep YOK). Ham enum sızmaz.
 * NOT: status transition (resolve/close) burada test edilmez — S900001'i CLOSED yapmak müşteri
 * reopen fixture'ını bozar; lifecycle geçişleri integration suite'inde kanonik olarak kapsanır.
 */
const s = ids.support;

test.describe("Product Support (store admin)", () => {
  test("@admin-regression inbox → detail → context/SLA → assign to me → reply; no raw enum", async ({ page }) => {
    await page.goto("/support");

    // Seeded ticket inbox'ta görünür
    const row = page.locator("tr", { hasText: s.seededTicketNumber });
    await expect(row).toBeVisible();
    await row.getByTestId("ticket-row-link").click();
    await expect(page).toHaveURL(/\/support\/.+/);

    // Bağlam (ürün) + SLA render (RESOLVED → SLA "Tamamlandı"; ham enum değil)
    await expect(page.locator("body")).toContainText(s.orderLineProductTitle);
    await expect(page.locator("body")).toContainText("Tamamlandı");

    // Kendime ata → server-authoritative (artık "Atanmadı" değil)
    await page.getByTestId("ticket-assign-me").click();
    await expect(page.locator("body")).not.toContainText(/Atanmadı|Unassigned/);

    // Admin yanıtı → server-authoritative (mesaj yazışmada görünür; optimistic sahte state yok)
    await page.locator("#support-reply").fill("E2E destek yanıtı");
    await page.getByTestId("ticket-reply-submit").click();
    await expect(page.locator("body")).toContainText("E2E destek yanıtı");

    // Ham enum / teknik id sızmaz
    await expect(page.locator("body")).not.toContainText(
      /\b(WAITING_STORE|WAITING_CUSTOMER|PRODUCT_NOT_WORKING|TICKET_ASSIGNED|SHIPMENT_DELIVERED)\b/,
    );
  });
});
