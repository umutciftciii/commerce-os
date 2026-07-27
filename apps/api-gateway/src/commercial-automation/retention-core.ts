/**
 * TODO-161A.1 (ADR-133/134/135) — Attribution ham event retention ÇEKİRDEĞİ (SAF; prisma/fastify yok).
 *
 * Kapsam (ADR-133): yalnız HAM funnel/click event satırları budanabilir. Finans snapshot'ları
 * (OrderAttribution/OrderSponsoredAttribution), iade defterleri, settlement/charge/payment/agreement
 * ASLA silinmez. Sponsored ve influencer domain tabloları AYRI kalır; yalnız SAF yardımcılar ortaktır.
 *
 * Güvenlik (ADR-135): cutoff SUNUCU config otoritesidir (istemci gönderemez); circuit-breaker aday
 * satır sayısını sınırlar; dry-run varsayılan; apply explicit.
 */

/** Budanabilir HAM event tabloları. YALNIZ bunlar; finans/defter tabloları listede DEĞİLDİR. */
export type RetentionTable = "SponsoredProductEvent" | "AttributionClick";

export type RetentionDomain = "sponsored" | "influencer";

export interface RetentionTableSpec {
  table: RetentionTable;
  domain: RetentionDomain;
  /** Bu tablo için retention gün sayısını hangi config anahtarı yönetir (dokümantasyon). */
  retentionDaysConfigKey: string;
}

/** Silinebilir tabloların açık kaydı (allowlist). Buraya finans/defter tablosu EKLENEMEZ. */
export const RETENTION_TABLE_SPECS: readonly RetentionTableSpec[] = [
  {
    table: "SponsoredProductEvent",
    domain: "sponsored",
    retentionDaysConfigKey: "SPONSORED_EVENT_RETENTION_DAYS",
  },
  {
    table: "AttributionClick",
    domain: "influencer",
    retentionDaysConfigKey: "INFLUENCER_CLICK_RETENTION_DAYS",
  },
] as const;

const MS_PER_DAY = 86_400_000;

/**
 * Retention cutoff instant'ı: `now - retentionDays`. Bu instant'tan (dahil değil, `<`) ÖNCE oluşan
 * ham event'ler budama adayıdır. `now` ve gün sayısı çağırandan gelir; gün sayısı SUNUCU config'idir.
 */
export function computeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/**
 * Circuit breaker: tek turda bir tablodan silinecek aday satır sayısı `maxDeletePerRun`'ı aşarsa APPLY
 * reddedilir (kontrolsüz kütlesel silme koruması). `maxDeletePerRun <= 0` → devre dışı (asla tripleme).
 */
export function isCircuitBreakerTripped(candidateCount: number, maxDeletePerRun: number): boolean {
  if (maxDeletePerRun <= 0) return false;
  return candidateCount > maxDeletePerRun;
}
