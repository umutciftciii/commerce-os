/**
 * TODO-156D tamamlama (ADR-081/082) — Slug değişiminde SlugHistory + otomatik 301 redirect yazımı.
 *
 * ÇAĞIRAN TRANSACTION İÇİNDE çalışır (ürün/kategori slug güncellemesiyle atomik commit). SADECE slug
 * gerçekten değiştiğinde çağrılır. Chain collapse + self/back-rename guard uygular → redirect zinciri/loop
 * OLUŞMAZ, canonical ile çelişmez. Kanonik path şekli `@commerce-os/utils` (productUrlPath/categoryUrlPath)
 * ile TEK KAYNAK — storefront runtime çözümleyici aynı path'i bekler.
 */
import type { TransactionClient } from "@commerce-os/db";
import { productUrlPath, categoryUrlPath } from "@commerce-os/utils";

export type SlugGovernanceEntityType = "PRODUCT" | "CATEGORY";

export interface SlugChangeParams {
  storeId: string;
  entityType: SlugGovernanceEntityType;
  entityId: string;
  oldSlug: string;
  newSlug: string;
  createdBy?: string | null;
}

/** Entity türüne göre kanonik path (redirect source/target). */
export function entityPath(entityType: SlugGovernanceEntityType, slug: string): string {
  return entityType === "PRODUCT" ? productUrlPath(slug) : categoryUrlPath(slug);
}

/**
 * Adımlar (SIRA KRİTİK):
 *  1) SlugHistory upsert (immutable: create-or-noop; UPDATE/DELETE yok; unique → idempotent, duplicate yok).
 *  2) Chain collapse: hedefi ESKİ path olan redirect'ler YENİ path'e repoint (A→B, B→C ⇒ A→C).
 *  3) Kaynağı YENİ path olan redirect'leri sil (repoint sonrası self-redirect + artık CANLI sayfadan
 *     yönlendirme olamaz — back-rename/slug geri-kullanım güvenli; loop tohumu temizlenir).
 *  4) Eski→yeni 301 redirect upsert (source unique → duplicate yok; tekrar rename güncellenir).
 *
 * Tenant-aware (storeId her where'de). Race: transaction + unique kısıtlar ikinci yazanı çakıştırır/no-op yapar.
 */
export async function recordSlugChange(tx: TransactionClient, params: SlugChangeParams): Promise<void> {
  const { storeId, entityType, entityId, oldSlug, newSlug } = params;
  const oldPath = entityPath(entityType, oldSlug);
  const newPath = entityPath(entityType, newSlug);
  if (oldPath === newPath) return; // güvenlik ağı.

  // 1) İmmutable slug geçmişi.
  await tx.slugHistory.upsert({
    where: { storeId_entityType_oldSlug: { storeId, entityType, oldSlug } },
    create: { storeId, entityType, entityId, oldSlug, createdBy: params.createdBy ?? null },
    update: {},
  });

  // 2) Chain collapse.
  await tx.redirect.updateMany({ where: { storeId, targetPath: oldPath }, data: { targetPath: newPath } });

  // 3) Yeni path artık canlı → ondan yönlendiren kural olamaz.
  await tx.redirect.deleteMany({ where: { storeId, sourcePath: newPath } });

  // 4) Eski→yeni kalıcı (301) redirect.
  await tx.redirect.upsert({
    where: { storeId_sourcePath: { storeId, sourcePath: oldPath } },
    create: { storeId, sourcePath: oldPath, targetPath: newPath, type: "PERMANENT_301", enabled: true },
    update: { targetPath: newPath, type: "PERMANENT_301", enabled: true },
  });
}
