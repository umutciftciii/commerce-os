# ADR-271 — Auth / Session Architecture Analysis & Implementation Map

Kaynak denetimi (evidence-based) + Unified Session Policy implementasyonunun haritası. Tarih: 2026-08-04.
İlgili: `docs/adr/ADR-271-unified-session-policy.md` (§7 implementasyon özeti).

## 1. Mevcut mimari (implementasyon ÖNCESİ — audit)

İki ayrı opak-token oturum sistemi; app oturumları için JWT YOK. Her frontend Next App-Router BFF; ham token
**httpOnly** cookie'de server tarafında, gateway yalnız `sha256(token.SESSION_SECRET)` tutar.

| Boyut | Platform (`admin-web` + `store-admin-web`) | Customer (`storefront-web`) |
|---|---|---|
| Tablo | `PlatformSession` | `CustomerSession` (`storeId`,`customerId`) |
| Taşıma | `Authorization: Bearer` | `x-customer-session` header |
| Cookie | `commerce_os_admin_session` / `commerce_os_store_admin_session` | `commerce_os_customer_session` |
| Doğrulama | `authenticatePlatform` (server.ts) | `resolveCustomerFromRequest` (customers/index.ts) |
| CSRF | double-submit (admin BFF) | yok (Server Actions + SameSite) |

**Önemli:** `store-admin-web` gerçekte `platformLogin`'e biner → yalnız İKİ oturum tablosu var, üç uygulama paylaşır.

**ADR-271 öncesi boşluklar (hepsi doğrulandı):** yalnız tek **absolute** `expiresAt` (login'de bir kez, hiç
yenilenmez) → idle timeout / sliding expiry YOK. remember-me YOK (customer 30g koşulsuz). extend/refresh ucu YOK.
expiry UX yok (mid-session 401 inline hata; yalnız shell remount/next-render'da redirect). warning modal / geri
sayım yok. multi-tab logout sinyali yok. Policy değerleri dağınık (config TTL + per-app cookie flag + hardcoded
`customer-cookie.ts` 30g maxAge + CSRF 8h). localStorage'da token YOK (httpOnly-only). Login autocomplete zaten
doğru (`username`/`current-password`).

## 2. ADR-271 uyumu — implementasyon sonrası

| Spec maddesi | Durum | Nerede |
|---|---|---|
| Tek `SESSION_POLICY` kaynağı | ✅ | `packages/config/src/session-policy.ts` + `resolveSessionPolicy` |
| remember-off 30dk/8 saat · remember-on 7g/30g | ✅ | `DEFAULT_SESSION_POLICY` (+ `SESSION_*` env override) |
| `now ≤ min(lastActivityAt+idle, absoluteExpiresAt) && !revoked` | ✅ | `isSessionValid`/`sessionDeadline` |
| absolute uzatılamaz; expired diriltilmez | ✅ | extend `absoluteExpiresAt` sabit; rotate active-only |
| idle yalnız anlamlı aktiviteyle, throttle'lı, mousemove değil | ✅ | `shouldBumpActivity` + auth API bump (fire-and-forget) |
| additive migration + güvenli backfill, drop yok, replay-safe | ✅ | `20260804160000_adr271_unified_session_policy` |
| session creation + rotation + fixation | ✅ | login yeni token; extend rotation (`rotatedFromSessionId`) |
| cookie policy'den; httpOnly/Secure-prod/SameSite/path; localStorage'a token yok | ✅ | BFF `setSessionCookie`/`writeCustomerToken` |
| autocomplete username/current-password | ✅ (zaten) | 3 login formu |
| extend endpoint (CSRF/rate-limit/rotation, absolute sabit) | ✅ | `/auth/platform/extend`, `/public/.../customer/extend` |
| warning modal + geri sayım (a11y, aria-live, focus-trap) | ✅ | `SessionGuard` (Modal + `role=status`/`aria-live`) |
| unsaved form: sessiz redirect yok / POST yeniden gönderilmez | ✅ (modal ön-uyarı) / 🟡 form-bazlı eskalasyon future (TD-183) |
| multi-tab (BroadcastChannel + storage fallback) | ✅ | `SessionGuard` + `session-sync` (`*_session_sync`) |
| safe returnTo (same-origin; external/`//`/scheme/loop reddi) | ✅ | `safeReturnTo` / `safeInternalPath` / `safeNextPath` |
| logout: revoke + tüm auth cookie temizle + multi-tab + idempotent | ✅ | logout route/action + broadcast |
| tenant/role izolasyonu; revoked/expired 401; token loglanmaz; extend audit | ✅ | store-scope + rol guard'ları korunur; extend audit |

## 3. Veri modeli & migration

`PlatformSession` ve `CustomerSession`'a eklendi: `lastActivityAt` (default now), `absoluteExpiresAt` (**nullable**,
güvenli-additive), `rememberMe` (default false), `rotatedFromSessionId?`. `revokedAt`/`updatedAt` zaten vardı.
`expiresAt` **korundu** (repurpose YOK): login'de = `absoluteExpiresAt`; idle deadline `lastActivityAt`'ten
hesaplanır. Backfill: `absoluteExpiresAt=expiresAt`, `lastActivityAt=updatedAt`, `rememberMe=false`. Migration
`IF NOT EXISTS` ile replay-safe ve paylaşılan DB'de koşan ADR-271-öncesi süreçlerle çakışmaz (canlı doğrulandı:
79 mevcut PlatformSession backfill edildi).

## 4. Tasarım kararları (dokümante)

1. **`expiresAt` repurpose edilmedi** (ADR §2 taslağının aksine) — geriye-uyum + spec formülü. `absoluteExpiresAt`
   nullable → validator `?? expiresAt` fallback.
2. **Policy = active davranış**, flag-gated değil; backfill mevcut oturumları güvenceye alır. Env override yalnız
   pencere boyutu (izole smoke için küçültme; sunucu-otoriter).
3. **store-admin = PlatformSession** → platform-side değişiklik iki admin app'i kapsar.
4. **Broadcast anahtarı `*_session_sync`** — cookie adından KASITLI ayrı; yalnız mesaj tipi taşır, token değil.
5. **Customer extend CSRF** — storefront'ta double-submit yok; Next Server-Action same-origin + httpOnly cookie
   (attacker `x-customer-session`'ı okuyamaz/uyduramaz) + rate-limit yeterli savunma (ADR §5 riski kapatıldı).

## 5. Doğrulama

- **Offline gate:** db:generate ✓, build (tüm paket) ✓, repo-typecheck (exit 0) ✓, lint (0 error) ✓; testler:
  config 48 (24 yeni policy), contracts 151, gateway 2279 (yeni extend/idle/remember-me/rotation), admin 36
  (yeni cookie/returnTo), store-admin 368, storefront 550 (yeni next-path).
- **Live API smoke** (worktree gateway :4100, `SESSION_*` küçültülmüş — gerçek 30 dk bekleme YOK, gerçek DB):
  platform login→me(timing)→extend(rotate; **absolute değişmedi**; eski token 401/yeni 200)→idle-expiry (50 sn →
  me 401, absolute hâlâ ileride)→expired-cannot-extend (401); customer register (OTP dev)→rememberMe=true 7g/30g
  pencereleri→extend rotate.
- **Real browser smoke** (admin-web tam yaşam döngüsü): remember-me checkbox+helper, login, warning modal +
  geri sayım (0:11/0:19, aria-live, focus-trap), "Oturumu uzat" → devam, idle-expiry → login + tam mesaj
  "Oturumunuz sona erdi. Devam etmek için tekrar giriş yapın.", httpOnly (session token JS/localStorage'da YOK),
  multi-tab logout (bir sekme çıkış → diğeri anında login). Storefront login + remember-me + mobil 375 responsive.

## 6. Sonraki

TODO-170 (Refund Ledger) — return financial invariants + private media hardening ship edilene kadar **yeniden
BLOCKED** (bkz. Post-Audit Hardening). Sıradaki roadmap adayı (hardening sonrası): **Storefront Social Login &
Customer Identity Linking** (TD-181) — bu oturum temeli üzerine kurulur. Diğer future başlıklar: TD-178…184
(device mgmt, all-devices logout, anomaly detection, provider logout, unsaved-form eskalasyon, legacy TTL temizliği).

## 7. Post-Audit Hardening (2026-08-04)

Cross-module review §7 implementasyonunda deploy/correctness açıkları buldu; hepsi additive, follow-up migration
`20260804170000_adr271_returns_session_hardening` (fast-default; tablo rewrite yok). Detay: ADR-271 §8.

- **M1 — legacy cutover:** `policyVersion` (0=legacy/grandfathered, 1=native). Legacy oturumlar ilk anlamlı aktiviteye
  kadar **absolute-only** sayılır (idle atlanır), sonra native'e terfi → §7 backfill'inin deploy'da yapacağı sessiz
  kitlesel-logout (uzun oturumlar 30 dk'ya idle-collapse) önlendi.
- **M2 — migration lock:** backfill PG fast-default ile (`ADD COLUMN … DEFAULT` + `SET DEFAULT`), DDL tx içinde
  full-table `UPDATE` yok. §7'nin orijinal backfill UPDATE'i immutable kaldı → büyük tabloda kilit yapabilir; OPERATIONS
  deploy runbook'ta maintenance penceresi notu (TD-185).
- **M3 — ölü index drop:** `PlatformSession_absoluteExpiresAt_idx` / `CustomerSession_absoluteExpiresAt_idx` düşürüldü
  (hiçbir sweep/range sorgu `absoluteExpiresAt` kullanmıyor; geçerlilik per-row tokenHash).
- **S1 — activity classification:** `/me`, logout, extend `countAsActivity=false` → idle penceresini yenilemez; yalnız
  anlamlı authenticated aktivite `lastActivityAt`'i bumplar (ve legacy'yi terfi ettirir). `me()` polling idle oturumu
  sonsuza dek diri tutmaz.
- **S2 — multi-tab false-expiry:** peer-tab `expired`/`extended` yayını körlemesine güvenilmez; alan sekme `me()` ile
  teyit eder — rotated oturum hâlâ geçerliyse timing yeniler, logout etmez.
- **S4 — logout CSRF cleanup:** admin + store-admin logout CSRF cookie'yi de temizler (`clearCsrfCookie`); storefront
  tek httpOnly `x-customer-session` cookie kullanır ve zaten temizliyordu.
- **S5 — cookie Secure env hardening (CLOSED):** ortak `resolveCookieSecure`/`resolveSameSite` (utils); boş env
  prod'da `Secure=true` (default), `"false"`/geçersiz prod'da fail-fast; 5 cookie modülü tek policy + set/clear parity.
- **S3 — activity throttle footgun (CLOSED):** `SESSION_ACTIVITY_THROTTLE_SECONDS` 0 reddedilir, prod min 30 sn
  (`loadConfig` fail-fast), default 300; test override prod'a sızamaz.
- **S7 / P3 — FUTURE (düşük etki):** warningLead server-refresh; tek-sekme pending-work refresh. Bkz. TECHNICAL_DEBT.
- **Canlı smoke (2026-08-04):** worktree gateway :4100 + store-admin :3102 gerçek tarayıcı — login/remember-me UI,
  token httpOnly (localStorage'da yok), warning modal + countdown, extend (POST /api/auth/extend 200, absolute sabit,
  eski token 401), idle-expiry → login + "Oturumunuz sona erdi" mesajı, S4 logout → CSRF cookie temizlendi. Ayrıca
  legacy cutover + `/me`-terfi-etmez + anlamlı-aktivite-terfi + pending-work invariant (40 AWAITING→0, 3+2→5) + media
  encoded-path (raw/%2F/%252F/%5C/mixed→404, public 200) canlı HTTP doğrulandı. Multi-tab BroadcastChannel görsel
  yayılımı otomasyon tarayıcısının tab izolasyonu nedeniyle görsel teyit edilemedi (mekanizma unit-test + kod-doğru;
  gerçek tarayıcıda standart BroadcastChannel ile çalışır).
