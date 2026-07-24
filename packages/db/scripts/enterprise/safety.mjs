/**
 * Enterprise Demo Seed — YIKICI RESET GÜVENLİK KATMANI.
 *
 * Bağlam: 2026-07-23'te enterprise-demo kataloğu, çalışan yerel postgres'e karşı elle
 * çalıştırılan bir `prisma db push` (tüm tabloları düşürdü) sonucu kayboldu (bkz.
 * docs/TECHNICAL_DEBT.md TD-159G, docs/DECISIONS.md ADR-108). Bu modül, enterprise
 * seed'in kendi "temizle + yeniden oluştur" (wipeScope) davranışının aynı sınıf bir
 * kazayı tetiklemesini engeller.
 *
 * TASARIM: SAF fonksiyonlar — DB/Prisma gerektirmez, tümüyle birim-test edilebilir.
 * `persist.mjs` bu guard'ları çağırır; guard'lar mismatch'te HATA fırlatır (hard fail).
 *
 * Politika (ADR-108):
 *   1. Environment guard — DATABASE_URL üretim/staging'e benziyorsa yıkıcı seed REDDEDİLİR.
 *      localhost tek başına GÜVENLİ SAYILMAZ; yalnız bilinen dev/test host+db allowlist'i geçer.
 *   2. Store-scope guard — slug açıkça "enterprise-demo" ve korumalı store'larda DEĞİL.
 *   3. Row-count circuit breaker — eşikten fazla Product silinecekse, açık
 *      ALLOW_DESTRUCTIVE_DEMO_RESET=true olmadan durur.
 */

import { URL } from "node:url";

/** Yıkıcı (mevcut dolu kataloğu ezen) reset için gereken açık, bilinçli flag. */
export const DESTRUCTIVE_RESET_FLAG = "ALLOW_DESTRUCTIVE_DEMO_RESET";

/**
 * Environment guard'ı bilinçli olarak devre dışı bırakan ayrı kaçış kapısı (yalnız
 * standart-dışı yerel kurulumlar için; asla üretimde ayarlanmamalı).
 */
export const ANY_DB_OVERRIDE_FLAG = "ALLOW_DEMO_SEED_ON_ANY_DB";

/** Bu sayıdan fazla Product silinecekse circuit breaker devreye girer. */
export const DESTRUCTIVE_ROW_THRESHOLD = 10;

/** Bilinen güvenli yerel/dev/test DB host'ları (docker service adı dahil). */
const ALLOWED_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

/**
 * Üretim/staging işaretleri — host, veritabanı adı VEYA tam URL'de eşleşirse reddedilir.
 * (Yönetilen postgres sağlayıcıları + açık ortam kelimeleri.)
 */
const PROD_MARKERS = [
  /prod/i, /staging/i, /\bstage\b/i, /\blive\b/i,
  /rds\.amazonaws\.com/i, /\.neon\.tech/i, /supabase\.co/i,
  /\.azure\.com/i, /\.gcp\./i, /cloudsql/i, /digitalocean/i, /render\.com/i,
];

/**
 * DATABASE_URL'den host + veritabanı adını çıkar. Ayrıştırılamıyorsa {host:null}.
 * (Yerleşik URL parser; postgres/postgresql şemalarını kabul eder.)
 */
export function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== "string") return { host: null, database: null };
  try {
    // URL API postgres şemasını kabul eder; pathname baştaki "/" ile gelir.
    const u = new URL(databaseUrl);
    const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || null;
    return { host: u.hostname || null, database };
  } catch {
    return { host: null, database: null };
  }
}

/**
 * Environment guard — DATABASE_URL güvenli bir yerel/dev/test hedefi değilse HATA fırlat.
 * localhost olması TEK BAŞINA yeterli değildir: host allowlist'te olmalı ve hiçbir
 * üretim işareti (prod/staging/yönetilen-sağlayıcı) bulunmamalı.
 */
export function assertSafeDatabaseEnvironment(databaseUrl, env = process.env) {
  if (env[ANY_DB_OVERRIDE_FLAG] === "true") return; // bilinçli kaçış kapısı
  if (!databaseUrl) {
    throw new Error(
      `Guard: DATABASE_URL tanımsız — enterprise seed yıkıcı reset yapamaz. ` +
        `Yerel dev DB'sine işaret eden DATABASE_URL ayarlayın.`,
    );
  }
  for (const re of PROD_MARKERS) {
    if (re.test(databaseUrl)) {
      throw new Error(
        `Guard: DATABASE_URL üretim/staging işareti içeriyor (${re}). Yıkıcı demo seed REDDEDİLDİ. ` +
          `Gerçekten yerel bir kopyaysa ${ANY_DB_OVERRIDE_FLAG}=true ile bilinçli olarak override edin.`,
      );
    }
  }
  const { host, database } = parseDatabaseUrl(databaseUrl);
  if (!host || !ALLOWED_DB_HOSTS.has(host)) {
    throw new Error(
      `Guard: DB host '${host ?? "?"}' güvenli dev/test allowlist'inde değil ` +
        `(${[...ALLOWED_DB_HOSTS].join(", ")}). Yıkıcı demo seed REDDEDİLDİ. ` +
        `Yerel kopya için ${ANY_DB_OVERRIDE_FLAG}=true.`,
    );
  }
  return { host, database };
}

/**
 * Store-scope guard — seed yalnız açıkça "enterprise-demo" scope'unda çalışır ve
 * korumalı store'lara (demo-store) asla dokunmaz.
 */
export function assertScopeSlug(slug, protectedSlugs) {
  if (slug !== "enterprise-demo") {
    throw new Error(`Guard: seed yalnız 'enterprise-demo' scope'unda çalışır (slug=${slug}).`);
  }
  if (protectedSlugs && protectedSlugs.has(slug)) {
    throw new Error(`Guard: '${slug}' korumalı store — yazma reddedildi.`);
  }
}

/**
 * Row-count circuit breaker — wipeScope, mevcut enterprise-demo kataloğunu silmeden ÖNCE
 * çağrılır. Eşik altı silme (ilk seed / küçük kalıntı) serbesttir; eşik üstü yıkıcı ezme
 * için açık ALLOW_DESTRUCTIVE_DEMO_RESET=true gerekir. Aksi halde hard fail.
 */
export function assertDestructiveResetAllowed({
  existingProductCount,
  env = process.env,
  threshold = DESTRUCTIVE_ROW_THRESHOLD,
}) {
  if (!Number.isFinite(existingProductCount) || existingProductCount < 0) {
    throw new Error(`Guard: geçersiz existingProductCount=${existingProductCount}.`);
  }
  if (existingProductCount <= threshold) return { allowed: true, reason: "below-threshold" };
  if (env[DESTRUCTIVE_RESET_FLAG] === "true") return { allowed: true, reason: "explicit-flag" };
  throw new Error(
    `Guard: ${existingProductCount} enterprise-demo ürünü silinecek (> ${threshold} eşiği). ` +
      `Yıkıcı reset için açıkça ${DESTRUCTIVE_RESET_FLAG}=true ayarlayın. ` +
      `İşlem DURDURULDU (veri kaybı önlendi).`,
  );
}
