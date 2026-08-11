import { test, expect, type Page } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STORE_ADMIN_URL, PLATFORM_ADMIN_URL } from "../fixtures/env";
import { reloadUntil } from "../fixtures/platform-request-helpers";

/**
 * TODO-178 Faz F — Store→Platform talep CANONICAL lifecycle (PR smoke gate).
 *
 * Gerçek cross-app: mağaza (store-admin :3110) talep açar → platform (admin-web :3120) yönetir →
 * mağaza görünürlük/timeline'ı doğrular → resolve → mağaza confirm-close. TEK test, İKİ context
 * (iki farklı gerçek oturum/cookie). Server-authoritative: her mutation sonrası UI sonucu beklenir
 * (fixed sleep YOK; web-first assertion auto-wait). Cross-context değişiklikleri görmek için ilgili
 * sayfa reload edilir (optimistic-version tazeleme).
 *
 * HARD SECURITY (bu test'in çekirdek iddiası): platformun eklediği INTERNAL not mağaza yüzeyinde
 * ASLA görünmez (ne gövde metni, ne "Dahili" etiketi) ve talep geçmişine sızmaz.
 *
 * PR numarası GLOBAL sayaçtan gelir → sabit değil; create'ten dönen numara runtime'da yakalanır.
 */

const pr = ids.platformRequest;

// CI'da app'ler `next dev` (ilk-istek cold-compile); lokalde production start (hızlı). Cross-app
// çok-route senaryosu cold-compile toplamı için cömert süre ister — flake gizleme DEĞİL, altyapısal.
test.describe.configure({ timeout: 120_000 });

function requestIdFromUrl(page: Page): string {
  const m = page.url().match(/platform-requests\/([^/?#]+)/);
  if (!m) throw new Error(`[e2e] requestId not found in URL: ${page.url()}`);
  return m[1];
}

test.describe("Platform Request — canonical lifecycle", () => {
  test("@platform-smoke store creates → platform manages → visibility + resolve + close", async ({ browser }) => {
    // Benzersiz gövdeler: kendi mesajlarımı deterministik bul + INTERNAL sızıntısını kesin assert et.
    const nonce = `${Date.now().toString(36)}`;
    const subject = `E2E canonical ${nonce}`;
    const description = `Otomatik E2E canonical lifecycle talebi (${nonce}).`;
    const visibleReplyBody = `VISIBLE-REPLY-${nonce}`;
    const internalNoteBody = `INTERNAL-SECRET-${nonce}`;
    const storeReplyBody = `STORE-REPLY-${nonce}`;

    const storeCtx = await browser.newContext({ storageState: "tests/e2e/.auth/store-admin.json" });
    const platformCtx = await browser.newContext({ storageState: "tests/e2e/.auth/platform-admin.json" });
    const store = await storeCtx.newPage();
    const platform = await platformCtx.newPage();

    try {
      // ── 1) STORE: yeni talep oluştur (kategori + konu + açıklama + storeImpact; priority YOK) ──
      // NOT: YEREL ui kit label'ı CSS-uppercase + nested-label; getByLabel Türkçe İ case-fold'a
      // takılıyor. Türkçe-güvenli: select'ler option-filter ile, input/textarea placeholder ile.
      await store.goto(`${STORE_ADMIN_URL}/platform-requests/new`);
      const categorySelect = store.locator("select").filter({ has: store.locator("option", { hasText: pr.categoryLabel }) });
      await categorySelect.selectOption({ label: pr.categoryLabel });
      await store.getByPlaceholder("Kısa ve açıklayıcı bir başlık").fill(subject);
      await store.getByPlaceholder("Sorunu, beklentinizi ve varsa adımları yazın.").fill(description);
      const storeImpactSelect = store.locator("select").filter({ has: store.locator("option", { hasText: pr.storeImpactLabel }) });
      await storeImpactSelect.selectOption({ label: pr.storeImpactLabel });
      await store.getByRole("button", { name: "Talep oluştur" }).click();

      // Başarıda detail'e yönlenir; PR-###### numarası görünür.
      await store.waitForURL(/\/platform-requests\/(?!new)[^/]+$/, { timeout: 20_000 });
      const requestId = requestIdFromUrl(store);
      const prNo = (await store.getByRole("heading", { level: 1 }).innerText()).trim();
      expect(prNo).toMatch(/^PR-\d{6,}$/);

      // ── 2) PLATFORM: inbox'ta ara → bul → detail aç ──
      await platform.goto(`${PLATFORM_ADMIN_URL}/platform-requests`);
      await platform.getByLabel("Ara (no / konu)").fill(prNo);
      await platform.getByRole("button", { name: "Ara", exact: true }).click();
      const row = platform.getByText(prNo, { exact: true });
      await expect(row).toBeVisible();
      await row.click();
      await platform.waitForURL(new RegExp(`/platform-requests/${requestId}$`), { timeout: 15_000 });

      // ── 3) PLATFORM: kendime ata → öncelik → durum (IN_PROGRESS) ──
      await platform.getByRole("button", { name: "Kendime ata" }).click();
      await expect(platform.getByText("E2E Admin").first()).toBeVisible();

      const priority = platform.getByTestId("priority-selector");
      await priority.getByRole("combobox").selectOption("HIGH");
      await priority.getByRole("button").click();
      await expect(platform.getByText(pr.platformPriorityHigh).first()).toBeVisible();

      const status = platform.getByTestId("status-selector");
      await status.getByRole("combobox").selectOption("IN_PROGRESS");
      await status.getByRole("button", { name: "Geçir" }).click();
      await expect(platform.getByText(pr.platformStatusInProgress).first()).toBeVisible();

      // ── 4) PLATFORM: mağazaya görünür yanıt + DAHİLİ not ──
      const visibleComposer = platform.getByTestId("visible-reply-composer");
      await visibleComposer.getByRole("textbox").fill(visibleReplyBody);
      await visibleComposer.getByRole("button", { name: "Yanıtla" }).click();
      await expect(platform.getByText(visibleReplyBody)).toBeVisible();

      const internalComposer = platform.getByTestId("internal-note-composer");
      await internalComposer.getByRole("textbox").fill(internalNoteBody);
      await internalComposer.getByRole("button", { name: "Not ekle" }).click();
      await expect(platform.getByText(internalNoteBody)).toBeVisible();

      // ── 5) STORE: görünür yanıt görünür; INTERNAL not GÖRÜNMEZ; geçmişe sızmaz ──
      // Cross-context ilk-okuma: platformun visible yanıtı görünene kadar reload (ms-yarışı).
      await reloadUntil(store, async () => {
        await expect(store.getByText(visibleReplyBody)).toBeVisible({ timeout: 2500 });
      });
      // HARD SECURITY: INTERNAL gövde + hiçbir "Dahili/mağaza görmez/INTERNAL" etiketi mağazada yok.
      const storeBody = store.locator("body");
      await expect(storeBody).not.toContainText(internalNoteBody);
      for (const leak of pr.internalLeakStrings) {
        await expect(storeBody).not.toContainText(leak);
      }

      // ── 6) STORE: yanıt gönder ──
      await store.getByPlaceholder("Platform ekibine yanıt yazın…").fill(storeReplyBody);
      await store.getByRole("button", { name: "Gönder" }).click();
      await expect(store.getByText(storeReplyBody)).toBeVisible();

      // ── 7) PLATFORM: store yanıtı görünür → RESOLVED ──
      await reloadUntil(platform, async () => {
        await expect(platform.getByText(storeReplyBody)).toBeVisible({ timeout: 2500 });
      });
      const status2 = platform.getByTestId("status-selector");
      await status2.getByRole("combobox").selectOption("RESOLVED");
      await status2.getByRole("button", { name: "Geçir" }).click();

      // ── 8) STORE: RESOLVED görünür → çözümü onayla ve kapat → CLOSED terminal ──
      await reloadUntil(store, async () => {
        await expect(store.getByText(pr.storeStatusResolved).first()).toBeVisible({ timeout: 2500 });
      });
      await store.getByRole("button", { name: "Çözümü onayla ve kapat" }).click();
      await expect(store.getByText("Kapatıldı").first()).toBeVisible();
      // CLOSED terminal: mağaza artık yanıt kutusu görmez.
      await expect(store.getByRole("button", { name: "Gönder" })).toHaveCount(0);
    } finally {
      await storeCtx.close();
      await platformCtx.close();
    }
  });
});
