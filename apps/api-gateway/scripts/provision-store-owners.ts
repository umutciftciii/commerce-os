/**
 * Faz D — Store-admin OWNER provisioning/backfill CLI.
 *
 * Explicit manifest'ten (storeSlug|storeId → ownerEmail) her ACTIVE mağazaya OWNER StoreUser
 * oluşturur/converge eder. HEURISTIC YOK; "ilk mağaza"/demo/first-user fallback YOK. Mapping
 * olmayan ELIGIBLE (ACTIVE) mağaza varsa APPLY FAIL-CLOSED.
 *
 * GÜVENLİK: Varsayılan DRY-RUN. Yazma için `--apply` ZORUNLU. Manifest SECRET/parola içeremez.
 * passwordHash yalnız email-eşleşen PlatformUser'dan reuse edilir; yoksa OWNER INVITED bırakılır
 * (ACTIVE+credentialless OWNER asla). Çıktıya parola/hash ASLA basılmaz.
 *
 * Kullanım:
 *   node --import tsx apps/api-gateway/scripts/provision-store-owners.ts --manifest=<path.json>            # dry-run
 *   node --import tsx apps/api-gateway/scripts/provision-store-owners.ts --manifest=<path.json> --apply
 */
import { readFileSync } from "node:fs";
import { prisma } from "@commerce-os/db";
import { parseOwnerManifest, planStoreOwnerProvisioning } from "../src/store-auth/provisioning.js";
import { collectProvisioningInput, applyProvisioning } from "../src/store-auth/provisioning-db.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const manifestPath = args.find((a) => a.startsWith("--manifest="))?.split("=")[1];

  if (!manifestPath) {
    console.error("HATA: --manifest=<path.json> ZORUNLU.");
    process.exitCode = 1;
    return;
  }

  let manifest;
  try {
    manifest = parseOwnerManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  } catch (e) {
    console.error(`HATA: manifest okunamadı/geçersiz: ${e instanceof Error ? e.message : "unknown"}`);
    process.exitCode = 1;
    return;
  }

  const input = await collectProvisioningInput(prisma, manifest);
  const report = planStoreOwnerProvisioning(input);

  // İnsan-okunur rapor (parola/hash YOK).
  console.log("=== OWNER Provisioning Raporu (%s) ===", apply ? "APPLY" : "DRY-RUN");
  console.log(`ACTIVE mağaza:        ${report.activeStoreCount}`);
  console.log(`Eşlenen (mapped):     ${report.mappedStoreCount}`);
  console.log(`Eşlenmeyen ACTIVE:    ${report.unmappedActiveStores.length}`);
  for (const u of report.unmappedActiveStores) console.log(`   - UNMAPPED ACTIVE: ${u.slug} (${u.storeId})`);
  console.log(`Login-ready OWNER:    ${report.summary.loginReadyOwners}`);
  console.log(`INVITED (non-ready):  ${report.summary.invited}`);
  console.log(`SKIP (not-active):    ${report.summary.skippedNotActive}`);
  console.log(`Conflict:             ${report.summary.conflicts}`);
  for (const d of report.decisions) {
    console.log(`   [${d.outcome}] ${d.ref} — cred=${d.credential} linked=${d.linkedPlatformUserId ?? "-"}`);
  }
  for (const c of report.conflicts) console.log(`   [CONFLICT:${c.reason}] ${c.ref} — ${c.detail}`);
  console.log(`applicable(APPLY güvenli): ${report.applicable}`);

  if (!apply) {
    console.log("DRY-RUN — hiçbir yazma yapılmadı.");
    return;
  }
  if (!report.applicable) {
    console.error("APPLY REDDEDİLDİ (fail-closed): conflict veya eşlenmeyen ACTIVE mağaza var.");
    process.exitCode = 1;
    return;
  }
  const res = await applyProvisioning(prisma, report);
  console.log(`APPLY tamam: created=${res.created} converged=${res.converged} noop=${res.noop} skipped=${res.skipped}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
