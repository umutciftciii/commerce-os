# ADR-277 — Coupon / Campaign Rollback on Cancellation

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #191 merge `5ce426d`; CI lint·test·build 4m13s PASS).

**İlişkili:** [ADR-275](ADR-275-customer-order-cancellation-authority.md),
[ADR-058](ADR-058-campaigns-coupons.md) (F4A Campaigns & Coupons — "no-compensation" sınırlaması BURADA,
self-servis iptal için, BİLİNÇLİ genişletilir).

---

## Bağlam

ADR-058 açıkça belirtir (şema yorumu `CampaignRedemption`): "Siparis sonradan iptal/refund olsa da kayit
TARIHSEL kalir (kompanzasyon deseni yok)." Yani bugün iptal, kupon/kampanya kullanımını GERİ ALMAZ:
`Campaign.usageCount`/`Coupon.usageCount` sayaçları düşmez, `CampaignRedemption` silinmez, `CustomerCoupon`
`USED`'dan çevrilmez. Sonuç: müşteri iptal etse bile kupon "harcanmış" kalır, per-customer/global limit slotu
serbest kalmaz.

## Karar

Self-servis iptal için ADR-058'in sınırlaması **bilinçli olarak genişletilir**.
`apps/api-gateway/src/campaigns/cancellation-rollback.ts` `releaseOrderCampaignConsumption(tx, storeId,
orderId, now)` (iptal tx İÇİNDE):

1. Her `CampaignRedemption(orderId)` için `Campaign.usageCount` ATOMİK decrement (guard `usageCount>0` →
   negatife düşmez); varsa `Coupon.usageCount` de. → global + per-customer slot serbest.
2. `CampaignRedemption` satırları SİLİNİR (per-customer limit redemption COUNT'una dayandığından gerçek release
   için silme gerekir). Raporlama iz'i `OrderDiscount` snapshot'ında (immutable) korunur.
3. `CustomerCoupon(orderId, USED)` cüzdan kuponu: kampanyanın **CANLI uygunluğu** yeniden değerlendirilir
   (saf `resolveCouponRevertStatus`): kampanya (ve varsa kupon) `ACTIVE` + pencere içinde + limit dolmamış ⇒
   `AVAILABLE` (orderId/usedAt/appliedAt temizlenir); DEĞİLSE ⇒ `REVOKED`.

**Kampanya yapay biçimde YENİDEN CANLANDIRILMAZ:** expired kampanya tekrar aktif edilmez, limit dolmuş kampanya
zorla açılmaz, "geçmiş kampanya şartları restore edilmez" (müşteri kendi isteğiyle iptal etti). Motorun
apply-time kontrolü ikinci savunma hattıdır.

Pencere kenarı: `startsAt` inclusive, `endsAt` exclusive (`now >= endsAt` → dışında).

## Sonuçlar
- `+` İptal artık kupon/limit slotunu serbest bırakır; diğer siparişler/müşteriler haksız yere bloklanmaz.
- `+` Aktif kampanyada kupon müşteriye geri döner (AVAILABLE); expired/dolu kampanyada REVOKED (yanıltıcı
  "kullanılabilir" gösterilmez).
- `−` ADR-058'in "redemption tarihsel kalır" sınırlaması self-servis iptal kapsamında artık geçerli değil;
  kampanya-ilişkisi raporlaması `OrderDiscount` snapshot'ından beslenir (redemption değil).
- Idempotent değildir (redemption silindiği için ikinci çağrı doğal no-op) — yalnız iptal tx'inde bir kez.
