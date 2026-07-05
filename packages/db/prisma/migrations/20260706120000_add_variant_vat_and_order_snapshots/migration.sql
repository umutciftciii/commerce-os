-- F4C (ADR-063/ADR-064) — Varyant KDV alanlari + siparis satiri KDV/maliyet snapshot'lari.
-- ADDITIVE-only: kolon silme/yeniden adlandirma YOK, veri silme YOK, mevcut
-- siparisler MUTATE EDILMEZ (OrderLine backfill'i bilincli YOKTUR — eski
-- siparisler "legacy" kalir ve admin ozeti guvenli kismi durum gosterir).
--
-- priceMinor SEMANTIGI DEGISMEZ: KDV DAHIL brut satis fiyati olarak kalir;
-- vitrin/sepet/checkout gorunen fiyatlar birebir korunur. Admin bundan sonra
-- KDV HARIC net fiyat girer; sunucu brutu hesaplayip priceMinor'a yazar.

-- AlterTable: ProductVariant KDV alanlari (varsayilan oran %20 = 2000 bps;
-- mevcut sepet KDV cikarimi CART_TAX_RATE_PERCENT=20 ile tutarli).
ALTER TABLE "ProductVariant"
    ADD COLUMN "netPriceMinor" INTEGER,
    ADD COLUMN "vatRateBps" INTEGER NOT NULL DEFAULT 2000,
    ADD COLUMN "vatAmountMinor" INTEGER;

-- Backfill: mevcut varyantlarda brut fiyat KORUNARAK net/KDV ayristirilir:
--   net = round(brut * 10000 / (10000 + 2000)); vat = brut - net.
-- ROUND(numeric) pozitiflerde half-up davranir (JS Math.round ile ayni sonuc).
-- Gorunen (brut) fiyat DEGISMEZ — "surpriz fiyat degisikligi yok" garantisi.
UPDATE "ProductVariant"
SET "netPriceMinor" = ROUND("priceMinor" * 10000.0 / (10000 + "vatRateBps"))::integer,
    "vatAmountMinor" = "priceMinor" - ROUND("priceMinor" * 10000.0 / (10000 + "vatRateBps"))::integer
WHERE "netPriceMinor" IS NULL;

-- AlterTable: OrderLine siparis-ani snapshot alanlari (fatura/yasal belge +
-- kar analizi temeli). ESKI satirlarda NULL kalir (legacy; backfill YOK).
ALTER TABLE "OrderLine"
    ADD COLUMN "unitNetPriceMinor" INTEGER,
    ADD COLUMN "unitVatRateBps" INTEGER,
    ADD COLUMN "unitVatAmountMinor" INTEGER,
    ADD COLUMN "unitGrossPriceMinor" INTEGER,
    ADD COLUMN "unitListPriceMinor" INTEGER,
    ADD COLUMN "unitCostMinor" INTEGER,
    ADD COLUMN "lineNetAmountMinor" INTEGER,
    ADD COLUMN "lineVatAmountMinor" INTEGER,
    ADD COLUMN "lineGrossAmountMinor" INTEGER,
    ADD COLUMN "lineCostMinor" INTEGER;
