/**
 * PB-2/PB-3 — Restore hedef guard'ları (yıkıcı restore'un yanlış DB'yi ezmesini engeller).
 *
 * `packages/db/scripts/enterprise/safety.mjs` prod-marker + allowlist desenini yansıtır. SAF fonksiyonlar:
 * DB/IO yok → tam birim-test edilebilir (security testleri: cross-environment restore guard).
 */

/** Üretim/staging işaretleri — host/db/URL'de eşleşirse "production benzeri" sayılır. */
export const PROD_MARKERS: RegExp[] = [
  /prod/i,
  /staging/i,
  /\bstage\b/i,
  /\blive\b/i,
  /rds\.amazonaws\.com/i,
  /\.neon\.tech/i,
  /supabase\.co/i,
  /\.azure\.com/i,
  /\.gcp\./i,
  /cloudsql/i,
  /digitalocean/i,
  /render\.com/i,
];

export function looksLikeProduction(databaseUrl: string): boolean {
  return PROD_MARKERS.some((re) => re.test(databaseUrl));
}

function hostDbKey(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return null;
  }
}

export type RestoreGuardCode =
  | "DESTRUCTIVE_CONFIRM_REQUIRED"
  | "SAME_AS_CURRENT_DB_BLOCKED"
  | "PRODUCTION_TARGET_BLOCKED"
  | "TARGET_NOT_ALLOWLISTED";

export class RestoreGuardError extends Error {
  readonly code: RestoreGuardCode;
  constructor(code: RestoreGuardCode, message: string) {
    super(message);
    this.name = "RestoreGuardError";
    this.code = code;
  }
}

export interface RestoreTargetGuardInput {
  targetUrl: string;
  /** Süreç DATABASE_URL'i — hedef buna eşitse (mevcut DB'yi ezme) varsayılan REDDEDİLİR. */
  currentDatabaseUrl?: string;
  /** Verilirse hedef host bu listede olmalı. */
  allowlistHosts?: string[];
  /** Yıkıcı onay — true olmadan restore çalışmaz. */
  confirmDestructive: boolean;
  /** Production-benzeri hedef için ek, açık izin. */
  allowProductionTarget?: boolean;
  /** Production hedef için ayrı, açık ikinci onay. */
  confirmProductionRestore?: boolean;
  /** Mevcut DB üzerine restore'a bilinçli izin (varsayılan reddedilir). */
  allowRestoreOverCurrent?: boolean;
}

/** Hedef restore'a uygun değilse RestoreGuardError fırlatır. */
export function assertRestoreTargetAllowed(input: RestoreTargetGuardInput): void {
  if (input.confirmDestructive !== true) {
    throw new RestoreGuardError(
      "DESTRUCTIVE_CONFIRM_REQUIRED",
      "Restore yıkıcıdır; açık onay gerekir (--confirm-destructive).",
    );
  }

  const targetHost = (() => {
    try {
      return new URL(input.targetUrl).hostname;
    } catch {
      return null;
    }
  })();

  if (input.currentDatabaseUrl && !input.allowRestoreOverCurrent) {
    const t = hostDbKey(input.targetUrl);
    const c = hostDbKey(input.currentDatabaseUrl);
    if (t && c && t === c) {
      throw new RestoreGuardError(
        "SAME_AS_CURRENT_DB_BLOCKED",
        "Hedef, süreçteki mevcut DATABASE_URL ile aynı — mevcut DB'nin üzerine restore varsayılan olarak reddedilir.",
      );
    }
  }

  if (looksLikeProduction(input.targetUrl)) {
    if (input.allowProductionTarget !== true || input.confirmProductionRestore !== true) {
      throw new RestoreGuardError(
        "PRODUCTION_TARGET_BLOCKED",
        "Hedef production-benzeri — restore için --allow-production-target VE --confirm-production-restore gerekir.",
      );
    }
  }

  if (input.allowlistHosts && input.allowlistHosts.length > 0) {
    if (!targetHost || !input.allowlistHosts.includes(targetHost)) {
      throw new RestoreGuardError(
        "TARGET_NOT_ALLOWLISTED",
        `Hedef host '${targetHost ?? "?"}' allowlist'te değil (${input.allowlistHosts.join(", ")}).`,
      );
    }
  }
}
