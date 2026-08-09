# ADR-287 — Playwright E2E Suite as the Source-of-Truth Release Gate (TODO-176 PR1)

**Durum:** ACCEPTED & DEPLOYED (2026-08-09; PR1; TODO-176; PR #205 merge `9a1eca9`; CI `e2e / smoke` green; post-deploy prod-smoke green).

**İlişkili:** `docs/TESTING.md` (kullanım kılavuzu), `tests/e2e/README.md` (quickstart),
`docs/superpowers/specs/2026-08-09-todo-176-e2e-regression-suite-design.md` (tasarım spec).

---

## Bağlam

TODO-174/174A/174B/175/174B.2 gibi son fazların her birinde release gate'in **browser doğrulama**
bacağı, Claude'un manuel 4-viewport (375/768/1024/1440) click-through'uydu: her PR'da ad-hoc bir
worktree/fixture kurulur, gerçek-auth ile kritik ekranlar elle gezilir, ekran görüntüsü/DOM okunarak
regresyon aranırdı. Bu yaklaşım o ana kadar iyi çalıştı, ancak ölçeklenmiyor:

- **Tekrarlanabilir değil.** Her PR'da yeniden icat edilir (kurulum + gezinti adımları PR'dan PR'a
  küçük farklarla tekrar yazılır); kalıcı bir regresyon paketi biriktirmez.
- **Deterministik değil.** Sonuç Claude'un o oturumdaki gezinti kapsamına bağlıdır; aynı akış iki PR
  sonra farklı şekilde (veya hiç) test edilebilir.
- **CI'da çalışmaz.** Merge-blocking değildir — "browser smoke PASS" notu PR açıklamasında bir iddia
  olarak kalır, otomatik doğrulanmaz.
- **Pahalı ve yavaş büyüyor.** Fonksiyonellik arttıkça manuel kapsam ya daralır (bazı akışlar atlanır)
  ya da oturum süresi orantısız uzar.

Bu, "manuel smoke = release gate" modelinin doğal tavanıdır. TODO-176 bu tavanı repo-içi, kalıcı bir
Playwright E2E paketiyle kaldırır (PR1 = altyapı + auth + 8 çekirdek smoke + CI gate; PR2 = geniş
regresyon kapsamı, bkz. Consequences).

## Karar

> **Playwright E2E suite is the source-of-truth automated browser release gate; manual browser smoke
> is exploratory/complementary, not the primary regression mechanism.**

Somut olarak:

1. **Konum ve yapı.** Kök `tests/e2e/` + kökte `playwright.config.ts`. Dört proje:
   - `setup` — gerçek UI login (`/auth/login`) → `tests/e2e/.auth/customer.json` storageState üretir.
   - `smoke` — Desktop Chromium, `@smoke` grep, storageState reuse, `setup`'a `dependencies` ile bağlı.
   - `responsive` — `@responsive` grep, viewport 375/1440 (küçük, kritik subset — ana akış smoke'ta
     zaten kapsanıyor; burada amaç yalnız kırılma taraması), storageState + `setup` bağımlılığı.
   - `prod-smoke` — `@prod-smoke` grep, **anonim** (storageState/setup YOK), post-deploy hedef ortama
     karşı güvenli/read-only kontroller.
2. **Fixture baseline.** Dedike `packages/db/scripts/e2e-seed.mjs` (idempotent, `APP_ENV` guard'lı)
   izole `e2e-store` kurar: test müşterisi, çok-varyantlı ürün + basit ürün, kupon, adres, bir seed
   sipariş. Enterprise-demo'ya dokunulmaz. Write-path verisi (sepet vb.) test içinde üretilir/temizlenir.
3. **Auth gerçek.** Bypass/sahte session yok — `auth.setup.ts` gerçek login formunu kullanır, gerçek
   `commerce_os_customer_session` cookie'sini storageState'e yakalar.
4. **CI merge-blocking.** Ayrı `.github/workflows/e2e.yml`, job `smoke`; kendi required-status-check
   context'i (`e2e / smoke`). Başarısızlık artifact'i (playwright-report + test-results) yükler,
   `.auth/` asla yüklenmez.
5. **Manuelin rolü daralır, kaybolmaz.** Manuel browser smoke **exploratory/complementary** kalır:
   yeni/karmaşık UX'te ilk-elden doğrulama, Playwright'in henüz kapsamadığı köşe durumlarını keşfetme.
   Ama artık **release'i bloke eden mekanizma değil** — o rol Playwright suite'ine geçti.

Bu kararın operasyonel karşılığı `docs/TESTING.md`'deki Definition of Done'dır (backend/unit/integration
tests → kısa exploratory browser smoke → kritik davranış varsa kalıcı Playwright testi → Playwright
smoke green → CI green → ship).

## Sonuçlar

- **CI maliyeti.** Her PR artık ek bir job (`docker compose` stack + seed + Chromium install + test
  run) çalıştırır; süre büyür (bkz. `.github/workflows/e2e.yml`, `timeout-minutes: 30`). Kabul edilen
  ödünleşim: deterministik regresyon > CI süresi.
- **`workers: 1` serileştirme.** Tüm smoke/responsive testleri **aynı** e2e müşterisinin DB-tabanlı
  (server-authoritative) sepetini paylaşır (`fixtures/cart.ts`); `fullyParallel: false` yalnız
  dosya-içi sırayı garanti eder, dosyalar-arası izolasyonu SAĞLAMAZ. Bu yüzden `workers: 1` zorunlu —
  bilinen bir maliyet (paralel çalışamama), kaydedilmiş açık borç (bkz. `docs/TECHNICAL_DEBT.md`
  "per-worker cart isolation").
- **Flakiness policy zorunlu.** Arbitrary `sleep` yasak (web-first `expect` polling); `retries:
  CI ? 2 : 0`; flaky testi skip ederek gate'i yeşile çevirmek yasak — kök neden düzeltilmeden kalıcı
  skip yok.
- **PR2 kapsamı ertelendi.** PR1 yalnız 8 çekirdek smoke senaryosunu (auth/PDP variant/add-to-cart/
  badge/cart persistence/coupon/cart-checkout identity/order list-detail) kapsar. Reorder invariant,
  shopping-balance ödeme, mixed ödeme, cancellation, return, refund (ORIGINAL_PAYMENT/SHOPPING_BALANCE),
  İadelerim, Alışveriş Bakiyem, wishlist, review, order-experience review PR2'ye bırakıldı (bkz.
  `docs/TECHNICAL_DEBT.md`).
- **Required-check governance ayrı adım.** `.github/workflows/e2e.yml` eklemek onu otomatik olarak
  branch-protection'da **required** yapmaz; bu repo-admin adımı ayrıca dokümante edildi (bkz.
  `docs/TECHNICAL_DEBT.md` "required-status-check governance").
- **Store runtime ayrımı.** Storefront tek-mağaza pinned (`STOREFRONT_DEMO_STORE_SLUG`); local'de host
  `pnpm e2e:storefront` (:3100, worktree kodu), CI'da `storefront-web-e2e` docker servisi (branch
  checkout'undan build) aynı role hizmet eder. enterprise-demo (:3000) hiçbir E2E adımında dokunulmaz.

## Alternatifler

- **Manuel smoke'u sürdürmek (status quo).** Reddedildi — yukarıdaki Bağlam bölümündeki ölçeklenme
  sorunları çözülmez; her PR'da yeniden icat + non-deterministik + merge-blocking değil.
  Sadece bir "sağlık kontrolü" yapıyordu, gate değildi.
- **Cypress/diğer E2E framework'ü.** Değerlendirilmedi (repo zaten TypeScript/Next.js monorepo;
  Playwright'ın multi-project/storageState/trace desteği ADR kapsamındaki karar noktalarıyla iyi
  eşleşiyor). Framework seçimi bu ADR'ın odağı değil.
- **Cross-browser/device matrisi (BrowserStack vb.) — FUTURE.** PR1 yalnız Desktop Chromium + küçük
  responsive-viewport subset koşar. Gerçek cihaz/tarayıcı matrisi (Safari/Firefox/mobil cihazlar)
  bilinçli olarak PR1 kapsamı DIŞINDA bırakıldı — CI süresi/maliyeti bugünkü ölçekte gerekçelendirmiyor.
  BrowserStack (veya benzeri) entegrasyonu ayrı bir gelecek fazda değerlendirilecek (bkz.
  `docs/TECHNICAL_DEBT.md`).
