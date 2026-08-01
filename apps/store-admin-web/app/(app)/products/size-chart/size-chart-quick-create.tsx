"use client";

/**
 * TODO-165A Tasks 25/26 — Ürün formu içinden "Yeni beden tablosu oluştur".
 *
 * İkinci bir oluşturma formu YAZILMAZ: `app/(app)/size-charts/page.tsx`'in dışa açılan
 * `CreateSizeChart` bileşeni AYNEN mount edilir (beden sistemi seçimi, ölçü birimi,
 * cinsiyet/dil — hepsi tek yerde). Yeni tablo DRAFT olarak döner (assign yalnız
 * PUBLISHED chart'ta çalışır — §9); çağıran (`size-chart-step.tsx`) bunu seçili aday
 * yapar ve kullanıcıyı "önce yayınlayın" bilgisiyle yönlendirir.
 */

import type { SizeChartContract } from "@commerce-os/api-client";
import type { useLocale } from "../../../../components/ui";
import { CreateSizeChart } from "../../size-charts/page";

export interface SizeChartQuickCreateProps {
  locale: ReturnType<typeof useLocale>;
  onClose: () => void;
  onCreated: (chart: SizeChartContract) => void;
}

export function SizeChartQuickCreate({ locale, onClose, onCreated }: SizeChartQuickCreateProps) {
  return <CreateSizeChart locale={locale} onClose={onClose} onCreated={onCreated} />;
}
