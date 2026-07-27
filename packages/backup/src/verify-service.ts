/**
 * PB-2/PB-3 — Restore verification (izole hedefte gerçek restore + bütünlük kontrolleri).
 *
 * "Backup başarılı sayılmadan önce periyodik restore testi zorunlu" (spec §10). Bu servis, izole bir
 * PostgreSQL hedefine gerçek restore yapar ve şunları doğrular:
 *   - kritik tablolar mevcut + satır sayıları
 *   - migration history (`_prisma_migrations`) tutarlı
 *   - referential integrity örneklemesi (orphan yok)
 *   - en az bir bilinen fixture kaydı + ilişkisi (çağıran verir) + read-only smoke
 * Yalnız satır sayısı yeterli DEĞİLDİR (spec §10) → fixtureChecks zorunlu bir kanıt katmanıdır.
 */
import { parsePgConnection, type PgToolRunner } from "./pg.js";
import { runRestore, type RestoreInput, type RestoreServiceDeps } from "./restore-service.js";

/** Restore + doğrulamada beklenen çekirdek tablolar (spec §10). */
export const DEFAULT_CRITICAL_TABLES = [
  "Store",
  "Product",
  "ProductVariant",
  "InventoryItem",
  "Customer",
  "Order",
  "OrderLine",
  "PaymentAttempt",
  "HomeSection",
  "SponsorshipAgreement",
  "_prisma_migrations",
];

export interface FixtureCheck {
  label: string;
  sql: string;
  /** Skaler sonucu değerlendirir; false → doğrulama başarısız. */
  expect: (value: string) => boolean;
}

export interface VerifyInput {
  restore: RestoreInput;
  criticalTables?: string[];
  /** Manifest'ten beklenen en son migration adı (verilirse tam eşleşme aranır). */
  expectedMigrationLatest?: string | null;
  fixtureChecks?: FixtureCheck[];
}

export interface VerifyReport {
  ok: boolean;
  restoreDurationMs: number;
  tables: Array<{ table: string; exists: boolean; rows: number | null }>;
  migrations: { count: number; latest: string | null; matchedExpected: boolean | null };
  integrity: Array<{ label: string; ok: boolean; detail: string }>;
  fixtures: Array<{ label: string; ok: boolean; value: string }>;
  failures: string[];
}

export interface VerifyServiceDeps extends RestoreServiceDeps {
  pg: PgToolRunner;
}

export async function runRestoreVerification(
  deps: VerifyServiceDeps,
  input: VerifyInput,
): Promise<VerifyReport> {
  const { pg, logger } = deps;
  const failures: string[] = [];
  const conn = parsePgConnection(input.restore.targetUrl);

  // 1) Gerçek restore (izole hedef; guard restore-input içinde).
  const restore = await runRestore(deps, input.restore);

  // 2) Kritik tablo varlığı + satır sayısı.
  const tables: VerifyReport["tables"] = [];
  for (const table of input.criticalTables ?? DEFAULT_CRITICAL_TABLES) {
    const reg = await pg.query(conn, `SELECT to_regclass('"${table}"') IS NOT NULL`);
    const exists = reg === "t" || reg === "true";
    let rows: number | null = null;
    if (exists) {
      const c = await pg.query(conn, `SELECT count(*) FROM "${table}"`);
      rows = Number(c);
    } else {
      failures.push(`Kritik tablo eksik: ${table}`);
    }
    tables.push({ table, exists, rows });
  }

  // 3) Migration history.
  const migCountRaw = await pg
    .query(conn, `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)
    .catch(() => "0");
  const migLatest = await pg
    .query(
      conn,
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
    )
    .catch(() => "");
  const migrations = {
    count: Number(migCountRaw) || 0,
    latest: migLatest || null,
    matchedExpected:
      input.expectedMigrationLatest === undefined
        ? null
        : (migLatest || null) === (input.expectedMigrationLatest ?? null),
  };
  if (migrations.count === 0) failures.push("Migration history boş (_prisma_migrations 0 satır).");
  if (migrations.matchedExpected === false) {
    failures.push(
      `Migration latest beklenenle uyuşmuyor (beklenen=${input.expectedMigrationLatest}, gerçek=${migrations.latest}).`,
    );
  }

  // 4) Referential integrity örneklemesi (orphan OrderLine yok).
  const integrity: VerifyReport["integrity"] = [];
  const orphanCheck = await pg
    .query(
      conn,
      `SELECT count(*) FROM "OrderLine" ol LEFT JOIN "Order" o ON ol."orderId" = o.id WHERE o.id IS NULL`,
    )
    .catch((e) => `ERR:${(e as Error).message}`);
  const orphanOk = orphanCheck === "0";
  integrity.push({
    label: "OrderLine→Order orphan yok",
    ok: orphanOk,
    detail: orphanCheck.startsWith("ERR:") ? orphanCheck : `orphan=${orphanCheck}`,
  });
  if (!orphanOk) failures.push(`Referential integrity ihlali: OrderLine orphan (${orphanCheck}).`);

  // 5) Bilinen fixture kayıtları + read-only smoke (çağıran verir).
  const fixtures: VerifyReport["fixtures"] = [];
  for (const fc of input.fixtureChecks ?? []) {
    const value = await pg.query(conn, fc.sql).catch((e) => `ERR:${(e as Error).message}`);
    const ok = !value.startsWith("ERR:") && fc.expect(value);
    fixtures.push({ label: fc.label, ok, value });
    if (!ok) failures.push(`Fixture doğrulaması başarısız: ${fc.label} (değer=${value}).`);
  }

  const report: VerifyReport = {
    ok: failures.length === 0,
    restoreDurationMs: restore.durationMs,
    tables,
    migrations,
    integrity,
    fixtures,
    failures,
  };
  logger.info("restore verification finished", {
    ok: report.ok,
    tables: tables.length,
    fixtures: fixtures.length,
    failures: failures.length,
  });
  return report;
}
