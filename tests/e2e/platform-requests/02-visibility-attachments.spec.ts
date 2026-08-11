import { test, expect } from "@playwright/test";
import { STORE_ADMIN_URL } from "../fixtures/env";
import {
  openStoreAndPlatform,
  createStoreRequest,
  openPlatformDetail,
  attachmentIdFromHref,
  reloadUntil,
  TINY_PNG,
} from "../fixtures/platform-request-helpers";

// CI `next dev` cold-compile toleransı (lokal production'da etkisiz).
test.describe.configure({ timeout: 120_000 });

/**
 * TODO-178 Faz F — Attachment runtime + INTERNAL görünürlük güvenliği (regression).
 *
 * Gerçek yükleme/serve stack'i: mağaza görsel yükler → link görünür + serve erişilebilir; platform
 * hem STORE_VISIBLE hem INTERNAL ek yükler → mağaza YALNIZ visible eki görür, INTERNAL eki ne
 * listede ne de doğrudan serve ile alabilir (id bilinse bile 404). Security invariant → kalıcı.
 */
test.describe("Platform Request — visibility & attachments", () => {
  test("@platform-regression store photo visible+served; platform INTERNAL attachment hidden from store (404)", async ({ browser }) => {
    const nonce = Date.now().toString(36);
    const { storeCtx, platformCtx, store, platform } = await openStoreAndPlatform(browser);
    try {
      const { requestId, prNo } = await createStoreRequest(store, `E2E attach ${nonce}`, `Attachment runtime testi (${nonce}).`);

      // ── STORE: görsel yükle → link görünür ──
      await store.locator('input[type="file"]').setInputFiles({ name: "store-photo.png", mimeType: "image/png", buffer: TINY_PNG });
      const storeLink = store.getByTestId("platform-request-attachment-link");
      await expect(storeLink).toHaveCount(1);
      const storeHref = (await storeLink.getAttribute("href"))!;

      // Serve erişilebilir (200) — gerçek private serve stack'i.
      const served = await store.request.get(STORE_ADMIN_URL + storeHref);
      expect(served.status()).toBe(200);

      // ── PLATFORM: mağazanın görünür eki görünür + INTERNAL ek yükle ──
      await openPlatformDetail(platform, prNo, requestId);
      // Cross-context ilk-okuma: mağazanın az önce yüklediği ek görünene kadar reload.
      await reloadUntil(platform, async () => {
        await expect(platform.getByTestId("visible-attachment-link")).toHaveCount(1);
      });
      await platform.getByTestId("internal-attachment-upload").setInputFiles({ name: "internal-note.png", mimeType: "image/png", buffer: TINY_PNG });
      const internalLink = platform.getByTestId("internal-attachment-link");
      await expect(internalLink).toHaveCount(1);
      const internalId = attachmentIdFromHref((await internalLink.getAttribute("href"))!);

      // ── STORE: reload → INTERNAL ek GÖRÜNMEZ (yalnız kendi visible eki) ──
      await store.reload();
      await expect(store.getByTestId("platform-request-attachment-link")).toHaveCount(1);
      // HARD SECURITY: id bilinse bile store serve INTERNAL eki VERMEZ (store-scope + visibility → 404).
      const leaked = await store.request.get(`${STORE_ADMIN_URL}/api/platform-requests/attachments/${internalId}`);
      expect(leaked.status()).toBe(404);
    } finally {
      await storeCtx.close();
      await platformCtx.close();
    }
  });

  test("@platform-regression capability açıkken store nav 'Platform Talepleri' görünür", async ({ browser }) => {
    const { storeCtx, store } = await openStoreAndPlatform(browser);
    try {
      await store.goto(`${STORE_ADMIN_URL}/platform-requests`);
      await expect(store.getByRole("link", { name: "Platform Talepleri" })).toBeVisible();
    } finally {
      await storeCtx.close();
    }
  });
});
