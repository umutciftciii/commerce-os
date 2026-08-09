/**
 * TODO-174B.2 — Recovery case backfill CLI.
 *
 * SORUN: `createOrderExperienceReview` (müşteri review-submit) commit 6dde962 (TODO-174A) ile canlıya
 * girdi; auto-case açan `openRecoveryCaseForReview` ise commit e15b809 (TODO-174B F4) ile SONRADAN
 * eklendi. İki deploy arasında girmiş 1-2★ review'lar case'siz kaldı ("Sipariş Deneyimi" listesinde
 * Recovery/SLA/İşlem = —).
 *
 * ÇÖZÜM: Bu script `backfillMissingRecoveryCasesForStore` (tek yetkili mantık; integration test'li) ile
 * o orphan'lara idempotent şekilde case açar. SLA gerçek şikâyet zamanından (review.createdAt) hesaplanır.
 *
 * GÜVENLİK: Varsayılan DRY-RUN. Yazma için `--apply` + `--store=<id>` (veya bilinçli `--store=all`) ZORUNLU.
 * Idempotent (@@unique) → tekrar çalıştırmak yeni case üretmez.
 *
 * Kullanım:
 *   node --import tsx apps/api-gateway/scripts/backfill-recovery-cases.ts --store=<id>            # dry-run
 *   node --import tsx apps/api-gateway/scripts/backfill-recovery-cases.ts --store=<id> --apply
 *   node --import tsx apps/api-gateway/scripts/backfill-recovery-cases.ts --store=all --apply
 */
import { prisma } from "@commerce-os/db";
import { backfillMissingRecoveryCasesForStore } from "../src/order-experience/recovery-service.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const storeArg = args.find((a) => a.startsWith("--store="))?.split("=")[1];

  if (!storeArg) {
    console.error("HATA: --store=<id> (veya --store=all) ZORUNLU.");
    process.exitCode = 1;
    return;
  }
  if (apply && !storeArg) {
    console.error("HATA: --apply için --store zorunlu (kazara tüm-store yazma engellenir).");
    process.exitCode = 1;
    return;
  }

  const storeIds =
    storeArg === "all"
      ? (await prisma.store.findMany({ select: { id: true } })).map((s) => s.id)
      : [storeArg];

  console.log(`[backfill-recovery-cases] mode=${apply ? "APPLY" : "DRY-RUN"} stores=${storeIds.length}`);
  let totalScanned = 0;
  let totalCreated = 0;
  for (const storeId of storeIds) {
    const res = await backfillMissingRecoveryCasesForStore(storeId, { apply });
    totalScanned += res.scanned;
    totalCreated += res.created;
    if (res.scanned > 0) {
      console.log(`  ${storeId}: scanned=${res.scanned} created=${res.created} skipped=${res.skipped}`);
    }
  }
  console.log(
    `[backfill-recovery-cases] BİTTİ. toplam scanned=${totalScanned} created=${totalCreated}` +
      (apply ? "" : "  (DRY-RUN — yazma yok; uygulamak için --apply ekleyin)"),
  );
}

main()
  .catch((err) => {
    console.error("[backfill-recovery-cases] HATA:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
