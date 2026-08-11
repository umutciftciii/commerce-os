import { type Browser, type Page, expect } from "@playwright/test";
import { STORE_ADMIN_URL, PLATFORM_ADMIN_URL } from "./env";
import { ids } from "./ids";

/**
 * TODO-178 Faz F — cross-app E2E ortak yardımcıları. Her regression testi kendi izole talebini
 * açar (state-bağımsız). Locator'lar canonical smoke'ta doğrulanan Türkçe-güvenli desenlerdir
 * (select=option-filter, input/textarea=placeholder, platform=getByLabel/testid).
 */
const pr = ids.platformRequest;

/** 1x1 PNG (gerçek attachment runtime'ı için geçerli görsel; gateway sharp→webp işler). */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Cross-context ilk-okuma retry: bir context (ör. platform) diğerinin (ör. store) AZ ÖNCE
 * commit ettiği veriyi ilk kez okurken, client-mount tek-atış fetch ~ms'lik cross-session
 * yarışını kaçırabilir (reload sonrası tek fetch; 10s auto-wait yeni fetch tetiklemez). Gerçek
 * kullanıcının "yenile" davranışı: veri görünene kadar reload+assert. Flake gizleme DEĞİL —
 * assertFn hiç geçmezse toPass timeout ile GERÇEK regresyon yine başarısız olur.
 */
export async function reloadUntil(page: Page, assertFn: () => Promise<void>, timeout = 20_000) {
  await expect(async () => {
    await page.reload();
    await assertFn();
  }).toPass({ timeout, intervals: [400, 800, 1500, 2500] });
}

export async function openStoreAndPlatform(browser: Browser) {
  const storeCtx = await browser.newContext({ storageState: "tests/e2e/.auth/store-admin.json" });
  const platformCtx = await browser.newContext({ storageState: "tests/e2e/.auth/platform-admin.json" });
  const store = await storeCtx.newPage();
  const platform = await platformCtx.newPage();
  return { storeCtx, platformCtx, store, platform };
}

/** Store Admin yeni talep açar; detail'e yönlenir. requestId (URL) + prNo (PR-######) döner. */
export async function createStoreRequest(store: Page, subject: string, description: string): Promise<{ requestId: string; prNo: string }> {
  await store.goto(`${STORE_ADMIN_URL}/platform-requests/new`);
  const categorySelect = store.locator("select").filter({ has: store.locator("option", { hasText: pr.categoryLabel }) });
  await categorySelect.selectOption({ label: pr.categoryLabel });
  await store.getByPlaceholder("Kısa ve açıklayıcı bir başlık").fill(subject);
  await store.getByPlaceholder("Sorunu, beklentinizi ve varsa adımları yazın.").fill(description);
  await store.getByRole("button", { name: "Talep oluştur" }).click();
  await store.waitForURL(/\/platform-requests\/(?!new)[^/]+$/, { timeout: 20_000 });
  const requestId = store.url().match(/platform-requests\/([^/?#]+)/)![1];
  const prNo = (await store.getByRole("heading", { level: 1 }).innerText()).trim();
  expect(prNo).toMatch(/^PR-\d{6,}$/);
  return { requestId, prNo };
}

/** Platform Admin inbox'ta ara → talebi bul → detail'i aç (requestId doğrulanır). */
export async function openPlatformDetail(platform: Page, prNo: string, requestId: string) {
  await platform.goto(`${PLATFORM_ADMIN_URL}/platform-requests`);
  await platform.getByLabel("Ara (no / konu)").fill(prNo);
  await platform.getByRole("button", { name: "Ara", exact: true }).click();
  const row = platform.getByText(prNo, { exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await platform.waitForURL(new RegExp(`/platform-requests/${requestId}$`), { timeout: 15_000 });
}

/** Platform durum geçişi (status-selector: enum value + "Geçir"). */
export async function platformSetStatus(platform: Page, statusValue: string) {
  const status = platform.getByTestId("status-selector");
  await status.getByRole("combobox").selectOption(statusValue);
  await status.getByRole("button", { name: "Geçir" }).click();
}

/** Bir attachment link href'inden id parçalar (ham storageKey/UUID UI'da değil; id = attachment id). */
export function attachmentIdFromHref(href: string): string {
  const m = href.match(/attachments\/([^/?#]+)/);
  if (!m) throw new Error(`[e2e] attachment id not found in href: ${href}`);
  return m[1];
}
