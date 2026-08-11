import { test, expect } from "@playwright/test";
import { STORE_ADMIN_URL, PLATFORM_ADMIN_URL } from "../fixtures/env";
import { ids } from "../fixtures/ids";
import {
  openStoreAndPlatform,
  createStoreRequest,
  openPlatformDetail,
  platformSetStatus,
  reloadUntil,
} from "../fixtures/platform-request-helpers";

const pr = ids.platformRequest;

// CI `next dev` cold-compile toleransı (lokal production'da etkisiz).
test.describe.configure({ timeout: 120_000 });

/**
 * TODO-178 Faz F — Atama/searchable selector/inbox filtre + SLA render + reopen (regression).
 * Ham teknik id (cuid) UI'da GÖRÜNMEZ; assignable directory searchable; SLA insan-okunur etiket.
 */
test.describe("Platform Request — assignment, filter, SLA", () => {
  test("@platform-regression searchable assign to another user → inbox assignee filter finds it; no raw id; SLA labels", async ({ browser }) => {
    const nonce = Date.now().toString(36);
    const { storeCtx, platformCtx, store, platform } = await openStoreAndPlatform(browser);
    try {
      const { requestId, prNo } = await createStoreRequest(store, `E2E assign ${nonce}`, `Assignment/SLA testi (${nonce}).`);
      await openPlatformDetail(platform, prNo, requestId);

      // ── Searchable AssigneeSelector: min 2 char + debounce → gerçek sonuç → seç ──
      const selector = platform.getByTestId("assignee-selector");
      await selector.getByRole("textbox").fill(pr.agentSearchTerm); // "agent"
      const agentResult = selector.getByRole("button", { name: new RegExp(pr.agentName) }); // "E2E Agent"
      await expect(agentResult).toBeVisible();
      await agentResult.click();

      // Atama server-authoritative → assignee adı görünür.
      await expect(platform.getByText(pr.agentName).first()).toBeVisible();

      // HARD SECURITY: ham teknik id (cuid ~25 alfanumerik) görünür metinde yok.
      await expect(platform.locator("body")).not.toContainText(/\bc[a-z0-9]{24}\b/);

      // SLA insan-okunur etiket (raw state enum'ı sızmaz).
      await expect(platform.getByText("İlk yanıt").first()).toBeVisible();
      const pbody = platform.locator("body");
      for (const rawKey of ["INSIDE", "DUE_TODAY", "OVERDUE", "FIRST_RESPONSE", "RESOLUTION"]) {
        await expect(pbody).not.toContainText(rawKey);
      }

      // ── Inbox assignee filtresi → Belirli kullanıcı → E2E Agent → talebimiz bulunur ──
      await platform.goto(`${PLATFORM_ADMIN_URL}/platform-requests`);
      await platform.getByLabel("Atanan filtresi").selectOption("USER");
      const inboxSelector = platform.getByTestId("assignee-selector");
      await inboxSelector.getByRole("textbox").fill(pr.agentSearchTerm);
      await inboxSelector.getByRole("button", { name: new RegExp(pr.agentName) }).click();
      await expect(platform.getByText(prNo, { exact: true })).toBeVisible();
    } finally {
      await storeCtx.close();
      await platformCtx.close();
    }
  });

  test("@platform-regression RESOLVED → store reopen → fresh live cycle", async ({ browser }) => {
    const nonce = Date.now().toString(36);
    const { storeCtx, platformCtx, store, platform } = await openStoreAndPlatform(browser);
    try {
      const { requestId, prNo } = await createStoreRequest(store, `E2E reopen ${nonce}`, `Reopen testi (${nonce}).`);
      await openPlatformDetail(platform, prNo, requestId);

      // Platform: doğrudan RESOLVED (OPEN→RESOLVED izinli).
      await platformSetStatus(platform, "RESOLVED");

      // Store: RESOLVED görünür → yeniden aç (cross-context ilk-okuma → reload retry).
      await store.goto(`${STORE_ADMIN_URL}/platform-requests/${requestId}`);
      await reloadUntil(store, async () => {
        await expect(store.getByText(pr.storeStatusResolved).first()).toBeVisible({ timeout: 2500 });
      });
      const reopenBtn = store.getByRole("button", { name: "Yeniden aç" });
      await expect(reopenBtn).toBeVisible();
      await reopenBtn.click();

      // Fresh live cycle: reopen sonrası talep tekrar aktif → "Yeniden aç" kaybolur, yanıt kutusu döner.
      await expect(store.getByRole("button", { name: "Yeniden aç" })).toHaveCount(0);
      await expect(store.getByRole("button", { name: "Gönder" })).toBeVisible();
    } finally {
      await storeCtx.close();
      await platformCtx.close();
    }
  });
});
