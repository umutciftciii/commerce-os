/**
 * TD-FR-7 Faz 1 / Task 2 — RETURN_REVIEW_STARTED idempotent audit izi.
 *
 * K2 kararı: bu bir DURUM GEÇİŞİ DEĞİL — talebi UNDER_REVIEW'e geçirmez, yalnız "ilk gerçek admin
 * kararı" (approve VEYA reject) anını append-only işaretler. Kolon EKLENMEZ (ReturnStatusHistory
 * şemaya `metadata` sütunu yok) → mevcut `note` alanına JSON-serileştirilmiş bir işaretçi yazılır
 * (yalnız insan-okur audit amaçlı — idempotency ARTIK bu alana bakmaz, aşağı bakınız).
 *
 * Depolama yeri: ReturnStatusHistory (metadata alanı yoksa `note`). Yeni bir tablo/kolon açmak K2'yi
 * ihlal eder; AuditLog (recordAudit) ise route katmanında `prisma` global'ini kullanır — tx-bağlı
 * garanti (approve/reject transaction'ı rollback olursa iz de rollback olsun) veremez. Bu yüzden
 * applyReturnTransition'ın zaten içinde bulunduğumuz `tx: Prisma.TransactionClient` ile
 * ReturnStatusHistory'ye yazmak append-only + tx-bağlı + kolon-eklemeden invariant'ların tümünü
 * karşılayan tek yer.
 *
 * IDEMPOTENCY — STRUCTURED EXACT-MATCH (substring/serbest-metin arama DEĞİL):
 * "Sahte durum" yazmamak için: fromStatus = toStatus = sourceStatus (aynı). Gerçek bir durum geçişi
 * asla fromStatus === toStatus olamaz (bkz. status-map.ts evaluateReturnTransition → NO_CHANGE
 * fail-closed reddi), bu yüzden bu satır yapısal olarak "gerçek bir geçiş değil, audit işaretçisi"
 * olarak ayırt edilebilir. İlk müşteri talebi kaydı fromStatus=null + actorType=CUSTOMER olduğundan
 * (from≠to zaten) bu kombinasyonla asla çakışmaz. Dolayısıyla idempotency sorgusu artık `note`
 * içeriğine (bir admin notu tesadüfen `"action":"RETURN_REVIEW_STARTED"` string'ini içerebilir —
 * yanlış-pozitif riski) DEĞİL, yalnız (actorType=ADMIN AND fromStatus IS NOT NULL AND
 * fromStatus=toStatus) yapısal koşuluna bakar. Prisma ORM iki kolonu doğrudan birbirine
 * karşılaştıramadığından (field-to-field karşılaştırma desteklenmiyor) parametreli `$queryRaw` ile
 * exact-match yapılır — kullanıcı girdisi (storeId/returnRequestId) tagged-template üzerinden
 * Prisma tarafından otomatik parametrelenir; serbest-metin arama YOKTUR.
 *
 * Concurrency: applyReturnTransition R3 (optimistic version-lock; `updateMany where version`) aynı
 * talep üzerindeki iki eşzamanlı "ilk karar" (approve/reject) denemesini DB seviyesinde tekilleştirir
 * — kaybeden 0 satır günceller ve VERSION_CONFLICT ile döner, `onCommit` (dolayısıyla bu fonksiyon)
 * HİÇ ÇAĞRILMAZ. Bu yüzden bu fonksiyonun kendi içinde ek bir unique index/lock'a gerek yoktur;
 * yarış zaten çağıranın version-lock'u ile önlenmiştir (migration eklenmedi).
 */
import type { Prisma, ReturnStatus } from "@prisma/client";

export const RETURN_REVIEW_STARTED_ACTION = "RETURN_REVIEW_STARTED" as const;

export interface WriteReviewStartedEventInput {
  storeId: string;
  returnRequestId: string;
  /** Kararın alındığı andaki durum (REQUESTED veya UNDER_REVIEW). */
  sourceStatus: ReturnStatus;
  decisionType: "APPROVE" | "REJECT";
  platformUserId: string;
}

/**
 * İlk gerçek admin kararında (approve/reject) bir kez RETURN_REVIEW_STARTED append-only izi yazar.
 * İdempotent: aynı talep için yapısal olarak eşdeğer bir iz (actorType=ADMIN, fromStatus=toStatus)
 * zaten varsa no-op. Concurrency garantisi çağıranın R3 optimistic version-lock'undan gelir (bkz.
 * dosya başı açıklama) — eşzamanlı iki "ilk karar" aynı satırda yarışamaz, kaybeden bu fonksiyona
 * hiç girmez.
 */
export async function writeReviewStartedEvent(
  tx: Prisma.TransactionClient,
  input: WriteReviewStartedEventInput,
): Promise<void> {
  // Yapısal exact-match: substring/serbest-metin arama YOK. Prisma ORM iki kolonu (fromStatus,
  // toStatus) doğrudan karşılaştıramadığından parametreli $queryRaw kullanılır. Enum kolonları
  // Postgres'te aynı `ReturnStatus` tipini paylaştığından `=` doğrudan çalışır; yine de tip
  // belirsizliğine karşı `::text` cast ile netleştiriyoruz.
  const existing = await tx.$queryRaw<{ one: number }[]>`
    SELECT 1 AS one
    FROM "ReturnStatusHistory"
    WHERE "returnRequestId" = ${input.returnRequestId}
      AND "storeId" = ${input.storeId}
      AND "actorType" = 'ADMIN'
      AND "fromStatus" IS NOT NULL
      AND "fromStatus"::text = "toStatus"::text
    LIMIT 1`;
  if (existing.length > 0) return;

  await tx.returnStatusHistory.create({
    data: {
      storeId: input.storeId,
      returnRequestId: input.returnRequestId,
      // Gerçek bir geçiş DEĞİL: from/to bilerek AYNI (bkz. dosya başı açıklama).
      fromStatus: input.sourceStatus,
      toStatus: input.sourceStatus,
      actorType: "ADMIN",
      actorId: input.platformUserId,
      // İnsan-okur audit amaçlı — idempotency KARARI bu alana bakmaz (yalnız yapısal koşula bakar).
      note: JSON.stringify({
        action: RETURN_REVIEW_STARTED_ACTION,
        sourceStatus: input.sourceStatus,
        decisionType: input.decisionType,
        platformUserId: input.platformUserId,
      }),
    },
  });
}
