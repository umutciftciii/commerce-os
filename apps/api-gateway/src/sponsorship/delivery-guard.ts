/**
 * TODO-161A (ADR-124) — Sponsorlu kampanya TESLİM (render) guard'ı.
 *
 * Guard'ın İKİ katmanı vardır ve bu dosya **ikincisidir** (asıl olan):
 *  1. Admin yazma: `SPONSORED` kampanya ticari olarak uygun değilken ACTIVE yapılamaz (409).
 *  2. **Teslim:** aday sorgusuna WHERE koşulu olarak eklenir → uygun olmayan kampanya HİÇ aday
 *     olmaz, dolayısıyla impression bile KAYDEDİLMEZ.
 *
 * Yalnız (1) yeterli DEĞİLDİR: anlaşma yayından sonra sona erebilir, vade geçebilir, bütçe
 * tükenebilir. "Sessizce sponsorlu gösterim üretip ticari kaydı olmayan kampanya çalıştırma"
 * kuralı ancak teslim anındaki bu kontrolle sağlanır.
 *
 * Koşul, SAF ikizi `resolveCommercialIneligibility` ile AYNI kararı verir (bkz. billing-core.ts).
 */
import { Prisma } from "@prisma/client";

/**
 * `SPONSORED` kampanyalar için ticari uygunluk WHERE fragmanı.
 *
 * @param now teslim anı (UTC instant)
 * @param allowUnpaid `StoreSettings.allowUnpaidSponsoredCampaigns` — true ise guard uygulanmaz
 *   (yalnız ekranlarda risk göstergesi kalır).
 * @returns kampanya sorgusuna `AND` ile eklenecek koşul; guard kapalıysa `undefined`.
 */
export function buildCommercialDeliveryWhere(
  now: Date,
  allowUnpaid: boolean,
): Prisma.SponsoredProductCampaignWhereInput | undefined {
  if (allowUnpaid) return undefined;
  return {
    OR: [
      // Mağazanın kendi ürününü öne çıkarması — ticari kayıt gerekmez (guard MUAF).
      { commercialMode: "INTERNAL_PROMOTION" },
      // Üçüncü taraf adına yayın — geçerli, borcu olmayan, bütçesi tükenmemiş anlaşma ZORUNLU.
      {
        commercialMode: "SPONSORED",
        agreementLinks: {
          some: {
            agreement: {
              status: "ACTIVE",
              startsAt: { lte: now },
              endsAt: { gt: now },
              budgetExhaustedAt: null,
              // Vadesi geçmiş AÇIK tahakkuk YOK (türetilmiş OVERDUE — ADR-125).
              // `totalAmountMinor > 0`: NEGATİF tutarlı ADJUSTMENT (alacak azaltıcı) bir borç
              // DEĞİLDİR ve teslimi ENGELLEMEMELİDİR.
              charges: {
                none: {
                  status: { in: ["ISSUED", "PARTIALLY_PAID"] },
                  dueAt: { lt: now },
                  totalAmountMinor: { gt: 0 },
                },
              },
            },
          },
        },
      },
    ],
  };
}
