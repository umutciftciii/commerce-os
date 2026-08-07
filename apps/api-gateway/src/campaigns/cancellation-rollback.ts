/**
 * TODO-174 (ADR-277) — Sipariş iptalinde coupon/campaign KULLANIM geri alma (release).
 *
 * ADR-058'in "iptal/refund olsa da redemption TARİHSEL kalır (kompanzasyon yok)" sınırlaması, self-servis
 * iptal için BİLİNÇLİ olarak genişletilir (ADR-277). Kural:
 *   - Her CampaignRedemption(orderId) için Campaign.usageCount (ve varsa Coupon.usageCount) ATOMİK decrement
 *     (guard usageCount>0) → global + per-customer (redemption sayımı) slot serbest bırakılır.
 *   - CampaignRedemption satırı SİLİNİR (per-customer limit redemption COUNT'una dayandığından gerçek release
 *     için silme gerekir). Raporlama iz'i OrderDiscount snapshot'ında (immutable) korunur.
 *   - CustomerCoupon(orderId, USED) satırı: kampanyanın CANLI uygunluğu yeniden değerlendirilir. Uygunsa
 *     AVAILABLE'a döner (orderId/usedAt/appliedAt temizlenir); DEĞİLSE (expired/inactive/limit-dolu) REVOKED.
 *
 * Kampanyayı yapay biçimde YENİDEN CANLANDIRMAZ: expired kampanya tekrar aktif edilmez, limit dolmuş kampanya
 * zorla açılmaz, "geçmiş kampanya şartları restore edilmez". Motorun kendi apply-time kontrolü de ikinci hattır.
 */
import type { Prisma } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/** Cüzdan kuponunun iptal sonrası CANLI uygunluk girdisi (usageCount decrement SONRASI okunur). */
export interface CouponRevertEligibilityInput {
  campaignStatus: string;
  campaignStartsAt: Date | null;
  campaignEndsAt: Date | null;
  campaignUsageCount: number;
  campaignTotalUsageLimit: number | null;
  /** Kupon yoksa (kampanya-only redemption) null verilir → yalnız kampanya kontrolü. */
  couponStatus: string | null;
  couponStartsAt: Date | null;
  couponEndsAt: Date | null;
  couponUsageCount: number | null;
  couponTotalUsageLimit: number | null;
  now: Date;
}

function withinWindow(startsAt: Date | null, endsAt: Date | null, now: Date): boolean {
  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && now.getTime() >= endsAt.getTime()) return false;
  return true;
}

function underLimit(usageCount: number | null, totalUsageLimit: number | null): boolean {
  if (totalUsageLimit === null) return true;
  return (usageCount ?? 0) < totalUsageLimit;
}

/**
 * İptal sonrası cüzdan kuponu AVAILABLE'a mı dönmeli (yeniden kullanılabilir) yoksa REVOKED mı? SAF karar.
 * AVAILABLE ⇔ kampanya (ve varsa kupon) ACTIVE + pencere içinde + limit dolmamış. Aksi → REVOKED (revive YOK).
 */
export function resolveCouponRevertStatus(
  input: CouponRevertEligibilityInput,
): "AVAILABLE" | "REVOKED" {
  const campaignOk =
    input.campaignStatus === "ACTIVE" &&
    withinWindow(input.campaignStartsAt, input.campaignEndsAt, input.now) &&
    underLimit(input.campaignUsageCount, input.campaignTotalUsageLimit);
  if (!campaignOk) return "REVOKED";

  if (input.couponStatus !== null) {
    const couponOk =
      input.couponStatus === "ACTIVE" &&
      withinWindow(input.couponStartsAt, input.couponEndsAt, input.now) &&
      underLimit(input.couponUsageCount, input.couponTotalUsageLimit);
    if (!couponOk) return "REVOKED";
  }
  return "AVAILABLE";
}

export interface CampaignRollbackResult {
  redemptionsReleased: number;
  couponsReverted: number;
  couponsRevoked: number;
}

/**
 * Sipariş iptalinde coupon/campaign kullanımını geri alır (aynı iptal transaction'ında çağrılır).
 * Idempotent değildir: yalnız iptal başlatan tek transaction'da bir kez çağrılmalıdır (redemption satırı
 * silindiği için ikinci çağrı no-op olur — güvenli).
 */
export async function releaseOrderCampaignConsumption(
  tx: TransactionClient,
  storeId: string,
  orderId: string,
  now: Date,
): Promise<CampaignRollbackResult> {
  const redemptions = await tx.campaignRedemption.findMany({
    where: { storeId, orderId },
    select: { id: true, campaignId: true, couponId: true },
  });

  // 1) Sayaçları serbest bırak (atomik guard usageCount>0 → negatife düşmez).
  for (const r of redemptions) {
    await tx.campaign.updateMany({
      where: { id: r.campaignId, storeId, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
    if (r.couponId) {
      await tx.coupon.updateMany({
        where: { id: r.couponId, storeId, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  }

  // 2) Redemption satırlarını sil (per-customer limit COUNT'una dayandığından gerçek release).
  const deleted = await tx.campaignRedemption.deleteMany({ where: { storeId, orderId } });

  // 3) Cüzdan kuponlarını (USED, bu sipariş) CANLI uygunluğa göre AVAILABLE/REVOKED yap.
  const walletCoupons = await tx.customerCoupon.findMany({
    where: { storeId, orderId, status: "USED" },
    select: { id: true, campaignId: true, couponId: true },
  });

  let couponsReverted = 0;
  let couponsRevoked = 0;
  for (const wc of walletCoupons) {
    const campaign = await tx.campaign.findFirst({
      where: { id: wc.campaignId, storeId },
      select: { status: true, startsAt: true, endsAt: true, usageCount: true, totalUsageLimit: true },
    });
    const coupon = wc.couponId
      ? await tx.coupon.findFirst({
          where: { id: wc.couponId, storeId },
          select: { status: true, startsAt: true, endsAt: true, usageCount: true, totalUsageLimit: true },
        })
      : null;

    const revert = campaign
      ? resolveCouponRevertStatus({
          campaignStatus: campaign.status,
          campaignStartsAt: campaign.startsAt,
          campaignEndsAt: campaign.endsAt,
          campaignUsageCount: campaign.usageCount,
          campaignTotalUsageLimit: campaign.totalUsageLimit,
          couponStatus: coupon?.status ?? null,
          couponStartsAt: coupon?.startsAt ?? null,
          couponEndsAt: coupon?.endsAt ?? null,
          couponUsageCount: coupon?.usageCount ?? null,
          couponTotalUsageLimit: coupon?.totalUsageLimit ?? null,
          now,
        })
      : "REVOKED"; // kampanya silinmiş/erişilemez → revive etme.

    if (revert === "AVAILABLE") {
      await tx.customerCoupon.update({
        where: { id: wc.id },
        data: { status: "AVAILABLE", orderId: null, usedAt: null, appliedAt: null },
      });
      couponsReverted += 1;
    } else {
      await tx.customerCoupon.update({
        where: { id: wc.id },
        data: { status: "REVOKED", orderId: null },
      });
      couponsRevoked += 1;
    }
  }

  return { redemptionsReleased: deleted.count, couponsReverted, couponsRevoked };
}
