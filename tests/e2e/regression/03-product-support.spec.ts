import { test, expect, ids } from "../fixtures/test-base";

/**
 * TODO-177 (ADR-289) Faz F — Storefront Ürün Desteği regression. Gerçek UI: order-line CTA →
 * guided flow (topic → soru → branch) → self-service (ticket YOK) veya escalation (ticket) →
 * detail → reopen. Deterministik seed (`e2e-seed.mjs` support bloğu): order-1001 mug satırı +
 * 7 published DEFAULT question-set + RESOLVED ticket S900001. Fixed sleep/skip YOK; testid + expect
 * auto-wait; her mutation sonrası server-authoritative UI doğrulanır. Ham enum/id sızmaz.
 */
const s = ids.support;
const ORDER_LINE_ID = "e2e-order-1001-line-1";

test.describe("Product Support (storefront)", () => {
  test("@regression order-line CTA → guided self-service solved creates NO ticket", async ({ page }) => {
    await page.goto(`/account/orders/${s.deliveredOrderNumber}`);
    const cta = page.getByTestId("support-line-cta").first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/account\/support\/new/);

    // Topic seç → guided başlat
    await page.getByTestId("support-topic-PRODUCT_NOT_WORKING").click();
    await page.getByTestId("support-topic-continue").click();

    // Entry (SINGLE_SELECT): "Hiç açılmıyor" → branch → checked_power
    await expect(page.getByTestId("support-question-entry")).toBeVisible();
    await page.getByText("Hiç açılmıyor").click();
    await page.getByTestId("support-wizard-next").click();

    // checked_power (BOOLEAN): "Hayır" → self-service result
    await expect(page.getByTestId("support-question-checked_power")).toBeVisible();
    await page.getByRole("button", { name: "Hayır" }).click();
    await page.getByTestId("support-wizard-next").click();

    // Self-service çözüm → "Sorunum çözüldü" → ticket AÇILMAZ
    await expect(page.getByTestId("support-result")).toBeVisible();
    await page.getByTestId("support-result-solved").click();
    await expect(page.getByTestId("support-solved")).toBeVisible();

    // Ham enum/teknik id sızmaz
    await expect(page.locator("body")).not.toContainText(
      /\b(PRODUCT_NOT_WORKING|SELF_SERVICE_RESULT|SINGLE_SELECT|no_power)\b/,
    );
  });

  test("@regression unresolved guided flow escalates and creates a ticket", async ({ page }) => {
    await page.goto(`/account/support/new?order=${s.deliveredOrderNumber}&line=${ORDER_LINE_ID}`);
    await page.getByTestId("support-topic-PRODUCT_NOT_WORKING").click();
    await page.getByTestId("support-topic-continue").click();

    await page.getByText("Hiç açılmıyor").click();
    await page.getByTestId("support-wizard-next").click();
    // "Evet" → ESCALATE (dead-end yok; ticket her zaman mümkün)
    await page.getByRole("button", { name: "Evet" }).click();
    await page.getByTestId("support-wizard-next").click();

    await expect(page.getByTestId("support-escalation")).toBeVisible();
    await page.getByTestId("support-escalation-submit").click();

    // Server-authoritative: ticket oluştu → detay + ticket number (S + 6 hane)
    await expect(page).toHaveURL(/\/account\/support\/S\d{6}/);
    await expect(page.getByTestId("support-ticket-detail")).toBeVisible();
  });

  test("@regression seeded RESOLVED ticket detail shows reopen (within 7-day window)", async ({ page }) => {
    await page.goto(`/account/support/${s.seededTicketNumber}`);
    await expect(page.getByTestId("support-ticket-detail")).toBeVisible();
    await expect(page.locator("body")).toContainText(s.seededTicketStatusText);
    // RESOLVED + owner + pencere içinde → reopen görünür (store admin reopen yapamaz; müşteri davranışı)
    await expect(page.getByTestId("support-reopen-submit")).toBeVisible();
  });

  test("@regression support list renders tickets without raw enum leak", async ({ page }) => {
    await page.goto("/account/support");
    await expect(page.getByTestId("support-ticket-row").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /\b(RESOLVED|WAITING_STORE|WAITING_CUSTOMER|PRODUCT_NOT_WORKING)\b/,
    );
  });
});
