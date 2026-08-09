# PERF-001 — Local Storefront & Admin Navigation Latency

**Durum:** CLOSED & DEPLOYED — PR #210 merge `c3c7305` (2026-08-10). Post-deploy: `storefront-web` main'den rebuild+recreate; home/PLP/PDP 200 + render; warm PLP median 1.35 s / PDP 1.54 s.
**Kapsam:** Yalnız yerel/dev runtime navigasyon gecikmesi (root cause + fix). Production
observability'nin yerine GEÇMEZ. Feature scope'una (Shopping Balance vb.) dokunulmadı.
**Yöntem:** Tahminle optimizasyon YOK → önce ölç → root cause'u kanıtla → yalnız kanıtlanan
darboğazları düzelt (systematic-debugging).

---

## 1. Baseline (ölçüm)

Ortam: Docker Desktop 10 CPU / **7.75 GiB RAM** (host 16 GB), `next dev` (webpack) container'ları,
enterprise-demo dataset (471 ürün). Ölçüm: host→container HTTP (curl/node fetch), gateway
`requestId` logları, `docker stats`.

### Katman ayrıştırması (5 saniye nereye gidiyor)

| Katman | Warm ölçüm | Sonuç |
|---|---|---|
| api-gateway `/health` | 1–18 ms | Hızlı |
| gateway public uçları (store-info/theme/modules/campaigns) | 3–20 ms | Hızlı |
| gateway `products`/`search` | 24–120 ms | Kabul edilebilir |
| **Storefront Next render (warm)** | **1.4–2.2 s** | **DARBOĞAZ** |
| Storefront Next **cold compile** (ilk-hit) | **4–23 s** | Dev'e içkin (ayrı) |
| Storefront render **spike** (aralıklı) | **5–25 s** | Bellek baskısı |

**Kanıt:** Gateway+DB warm halde hızlı → 5 sn **Next render katmanında**, gateway/DB'de değil.

### Tek-render breakdown (warm PLP, fix ÖNCESİ)

| | total | gateway span (ilk→son çağrı) | non-gateway |
|---|---|---|---|
| örnek | 1.19–2.20 s | 0.97–1.68 s | 0.23–0.77 s |

7 gateway çağrısı (store-info, search, home, campaigns, theme, modules, reviews-summary); her biri
4–120 ms **ama aralarında saniyelik boşluklar** var → **waterfall + faz-arası render boşlukları**.

---

## 2. Root cause (kanıtlanmış)

1. **Dev compile-on-first-hit (cold):** rota başına 4–23 s, oturumda ilk ziyarette. En kötü
   navigasyonun (ilk PDP tıklaması) ana bileşeni. Task gereği AYRI kabul edilir.
2. **Bellek/süreç çekişmesi:** 3 Next dev sunucusu boşta ~5.8/7.75 GiB tutuyor. Docker VM belleğe
   yaklaşınca GC/olay-döngüsü stall'ları → **health check 3 s**, çağrı-arası 2–3 s boşluk, warm
   rotalarda aralıklı 5–25 s spike. **A/B kanıtı:** admin-web (kapsam-dışı) kapatılıp ~1.5 GiB
   boşaltılınca vitrin p90 **~%33** düştü (2.08→1.72 median; 5.79→4.23 max; 3.33→2.23 p90).
3. **Baseline warm render ~1.4–2 s:** `next dev`'e içkin RSC execution + dev overhead. Bundler'dan
   BAĞIMSIZ (bkz. §3 turbopack). Kısmen BFF waterfall'dan kaynaklı.
4. **Ortak-path (layout) sıralı BFF çağrıları:** `app/layout.tsx` her tam-yüklemede 6 bağımsız
   gateway çağrısını SIRAYLA await ediyordu; PDP sayfasında `dict→product→slotVariant→modules`
   waterfall'ı vardı. Gateway span'inin ana kaynağı.

### Elenen hipotezler (disproven — tahmin edilip ölçülerek çürütüldü)

- **Bind-mount yavaşlığı (macOS Docker):** Compose'da web app'ler için source bind-mount **YOK**
  (kaynak imaja COPY'lanıyor). Klasik macOS bind-mount darboğazı bu path için geçersiz.
- **Gateway/DB:** warm 4–120 ms. Darboğaz değil.
- **Turbopack (`next dev --turbopack`):** İzole container A/B'de warm render webpack ≈ turbopack
  (~2–3 s ikisi de), cold **karışık/DAHA KÖTÜ** (home cold 36 s vs webpack 4.6 s; PDP 15 s vs 4.4 s).
  Warm faydası YOK + riskli swap → **benimsenmedi** (kanıtlanmış negatif sonuç, tahmin değil).

---

## 3. Uygulanan fix'ler (yalnız kanıtlanan)

1. **`app/layout.tsx`** — 6 sıralı bağımsız BFF await → tek `Promise.all` batch (`getAuthCartProjection`,
   `getCurrentCustomer`, `getCampaignSlides`, `getStoreInfo`, `getNavCategories`, `getStoreTheme`,
   `cookies`). React `cache()` dedup davranışı DEĞİŞMEZ; yalnız eşzamanlı yayılırlar.
2. **`app/products/[handle]/page.tsx`** (PDP) — `dict/locale/params` tek batch; ürün detayı + slot
   variant + 4 modül bayrağı (birbirinden bağımsız) tek `Promise.all`. `generateMetadata` waterfall'ı
   da paralelleştirildi (product fetch `cache()` ile gövde ile paylaşılır).
3. **`app/products/page.tsx`** (PLP) — slot variant + REVIEWS/WISHLIST bayrakları arama batch'ine
   hoist edildi (kart-id'ye bağlı wishlist/rating batch'i gerçek veri bağımlılığı → korundu).
4. **`infra/docker/docker-compose.yml`** — `admin-web` (platform süper-admin, mağaza/vitrin dev
   akışının parçası DEĞİL) `profiles: ["platform"]` altına alındı → varsayılan `docker compose up`
   onu başlatmaz (A/B ile kanıtlı bellek-baskısı azaltımı). İhtiyaçta:
   `docker compose --profile platform up admin-web`.

### Uygulanmayanlar (bilinçli)

- **Turbopack:** §2 — kanıtlanmış fayda yok, riskli.
- **Cross-request/TTL cache:** task "global stale cache üretme" dedi; React `cache()` (request-scoped
  dedup) zaten var, korundu. Zaman-tabanlı cache eklenmedi.
- **Docker RAM artışı (7.75→12 GiB):** en yüksek etkili tek değişiklik AMA Docker Desktop GUI ayarı
  (commit edilemez/CI'da doğrulanamaz) → runbook/TD-200 önerisi olarak dokümante edildi.

---

## 4. Before/After (zorunlu tablo)

Aynı ortam (admin-web kapalı), warm, aralıklı ölçüm; median/max/p90 (saniye). Fix container'a
`docker cp` + HMR ile uygulanıp ölçüldü.

| Akış | median (önce→sonra) | max (önce→sonra) | p90 (önce→sonra) |
|---|---|---|---|
| Storefront PLP `/products` | 1.72 → **1.38** | 4.23 → **2.08** | 2.23 → **1.58** |
| Storefront PDP `/products/:h` | 1.95 → **1.38** | 7.20 → **1.43** | ~3.1 → **1.43** |
| PLP warm gateway span | 0.97–1.68 → **0.94–1.16** | — | — |

**Gerçek tarayıcı (Playwright @perf, docker :3000):** kullanıcının tam şikayet akışı
**PLP→PDP tıklama median 957 ms** (eskiden ~5 s); PLP yükleme 2.3 s; home 3.8 s (home ağır +
kalan bellek spike'ı).

Ayrıca A/B bellek etkisi: admin-web açık→kapalı p90 3.33→2.23 s (~%33).

---

## 5. Performance budget (gerçekçi)

- **Warm client navigasyon (kart→PDP):** hedef <1 s → **ULAŞILDI** (~957 ms median).
- **Warm tam-sayfa render (PLP/PDP SSR):** ~1.4 s median. **Sub-1s `next dev`'de ULAŞILAMAZ**
  (RSC execution + dev overhead içkin; turbopack de düşürmüyor — §2). Gerçekçi dev budget ~1.5 s.
- **Ana gateway/BFF istekleri:** birkaç yüz ms bandı → zaten sağlanıyor (4–120 ms).
- **Cold compile:** dev'e içkin (4–23 s), AYRI raporlanır. Tam çözüm = production build (`next start`)
  veya kalan bellek baskısı (Docker RAM). Kapsam dışı.
- **Kalan spike'lar (5–25 s):** yalnız Docker RAM artışı ile tam giderilir (TD-200).

---

## 6. Playwright perf guard

- Yeni **`perf`** projesi + **`@perf`** tag (`tests/e2e/perf/01-navigation-latency.spec.ts`),
  `pnpm e2e:perf`. **Required smoke gate'in DIŞINDA** → wall-clock varyansı merge'i bloke etmez.
- Tasarım: rota warm-up (cold compile ölçüm dışı) → her akış 3 kez → **MEDIAN** bütçeyle kıyaslanır
  (tek spike flaky yapmaz, sürekli 4–5 s regresyon yakalanır) → cömert bütçe **6000 ms**
  (`PERF_NAV_BUDGET_MS` override). Akışlar: home load, PLP load, **PLP→PDP tıklama** (şikayet akışı).

---

## 6a. İlgisiz pre-existing flake fix (gate'i açmak için)

İlk CI koşumunda `lint · test · build` job'u PERF-001 ile **ilgisiz** bir sebeple kırmızıya döndü:
`apps/store-admin-web/test/recovery-labels.test.ts` "DUE_TODAY" senaryosu `Date.now() + 2s` kullanıyordu.
`slaState` gün-sınırını YEREL takvim gününe (`isSameDay`) göre belirler; UTC CI runner'ı yerel gün
sınırına yakın (22:00–24:00 UTC) koşunca `now+2h` ertesi güne taşıp INSIDE dönüyordu (tarih-bağımlı
flake). Fix: test `now`'ı yerel öğlene sabitler → deterministik (UTC/LA/Kiritimati/GMT-14'te 12/12
geçer). **Test-only; üretim davranışı değişmez.** Bu, Shopping Balance/recovery feature scope'una
davranışsal dokunuş DEĞİLDİR; yalnız gate'i açan flaky-test hijyeni.

## 7. İlgili

- Kod: `apps/storefront-web/app/{layout,products/page,products/[handle]/page}.tsx`
- Infra: `infra/docker/docker-compose.yml` (admin-web `platform` profili)
- Test: `tests/e2e/perf/`, `playwright.config.ts` (`perf` projesi), `package.json` (`e2e:perf`)
- Borç: `docs/TECHNICAL_DEBT.md` TD-200 (Docker RAM under-provisioning + kalan spike)
