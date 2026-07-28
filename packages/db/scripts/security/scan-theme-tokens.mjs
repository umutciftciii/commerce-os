// H-1 — Theme Token Stored XSS: LEGACY tema token TARAMA scripti (SALT-OKUMA).
//
// Tüm ThemeVersion belgelerini @commerce-os/theme typed-token savunmasından geçirir
// ve geçersiz/güvensiz/bilinmeyen token içeren kayıtları raporlar. DB'yi HİÇ
// değiştirmez (sessiz mutate YOK — bkz. analiz §11). Amaç: bu düzeltmeden önce
// kaydedilmiş veya import edilmiş bozuk token'ları görünür kılmak.
//
// Kullanım:
//   node scripts/security/scan-theme-tokens.mjs                 # tüm store'lar, özet
//   node scripts/security/scan-theme-tokens.mjs --store=edm-store
//   node scripts/security/scan-theme-tokens.mjs --json          # tam JSON
//
// GÜVENLİK: Çıktı HAM token DEĞERİ taşımaz — yalnız path/layer/type/reason +
// theme/version kimlikleri + status. (Payload loglanmaz.)
import { PrismaClient } from "@prisma/client";
import { collectThemeTokenIssues, validateThemeDocument } from "@commerce-os/theme";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const storeArg = args.find((a) => a.startsWith("--store="));
const storeId = storeArg ? storeArg.split("=")[1] : undefined;
const asJson = args.includes("--json");

async function main() {
  const where = storeId ? { storeId } : {};
  const versions = await prisma.themeVersion.findMany({
    where,
    select: {
      id: true,
      themeId: true,
      storeId: true,
      version: true,
      status: true,
      document: true,
    },
    orderBy: [{ storeId: "asc" }, { themeId: "asc" }, { version: "asc" }],
  });

  const report = [];
  let unresolvable = 0;

  for (const v of versions) {
    const validation = validateThemeDocument(v.document);
    if (!validation.ok) {
      unresolvable += 1;
      report.push({
        themeId: v.themeId,
        versionId: v.id,
        storeId: v.storeId,
        version: v.version,
        status: v.status,
        schemaInvalid: true,
        issues: [],
      });
      continue;
    }
    const issues = collectThemeTokenIssues(validation.document);
    if (issues.length > 0) {
      report.push({
        themeId: v.themeId,
        versionId: v.id,
        storeId: v.storeId,
        version: v.version,
        status: v.status,
        schemaInvalid: false,
        // GÜVENLİK: yalnız güvenli metadata — ham değer YOK.
        issues: issues.map((i) => ({ path: i.path, layer: i.layer, type: i.type, reason: i.reason })),
      });
    }
  }

  const publishedAffected = report.filter((r) => r.status === "PUBLISHED").length;
  const draftAffected = report.filter((r) => r.status === "DRAFT").length;

  const summary = {
    scannedVersions: versions.length,
    affectedVersions: report.length,
    publishedAffected,
    draftAffected,
    schemaUnresolvable: unresolvable,
  };

  if (asJson) {
    console.log(JSON.stringify({ summary, report }, null, 2));
  } else {
    console.log("── H-1 Theme Token Scan (read-only) ─────────────────────────");
    console.log(summary);
    if (report.length === 0) {
      console.log("✓ Temiz: hiçbir versiyonda geçersiz/güvensiz token yok.");
    } else {
      console.log(`\n⚠ ${report.length} etkilenen versiyon:`);
      for (const r of report.slice(0, 100)) {
        const tag = r.schemaInvalid ? "SCHEMA_INVALID" : `${r.issues.length} token`;
        console.log(`  [${r.status}] store=${r.storeId} theme=${r.themeId} v${r.version} → ${tag}`);
        for (const i of r.issues.slice(0, 20)) {
          console.log(`      ${i.reason.padEnd(14)} ${i.path} (${i.type ?? "?"})`);
        }
      }
      console.log(
        "\nÖNERİ: Etkilenen PUBLISHED tema render'da güvenli biçimde atlanır " +
          "(render-time defense); yayınlama bloklanır. Bir düzeltme yayınlamak için " +
          "Theme Studio'da geçersiz alanları düzeltip yeniden yayınlayın.",
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("scan-theme-tokens failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
