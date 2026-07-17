"use client";

// Faz 2C-3 (ADR-072) — "Varyantları Oluştur" aksiyonu (Combination Preview paneli yanı).
//
// Kalıcı varyant üretimini tetikler ve sonuç özetini (oluşturulan/korunan/geri yüklenen/arşivlenen)
// gösterir. Aksiyon YALNIZ: ürün kaydedilmişse + varyant ekseni varsa + preview limiti aşılmıyorsa
// aktiftir (yetki sunucuda). Bu faz SKU Matrix DEĞİLDİR: inline SKU/fiyat/stok düzenleme YOK.

import { Alert, Button } from "../../../../components/ui";
import type { VariantGenerationController } from "./use-variant-generation";

export interface GenerateVariantsActionLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  button: string;
  generating: string;
  summaryTitle: string;
  createdLabel: (count: number) => string;
  keptLabel: (count: number) => string;
  restoredLabel: (count: number) => string;
  archivedLabel: (count: number) => string;
  manualLabel: (count: number) => string;
  // Stable error kodu → mesaj (bilinmeyen kod `default`).
  serverErrors: Record<string, string> & { default: string };
}

export interface GenerateVariantsActionProps {
  // Ürün kaydedilmiş + eksen var → bölüm görünür (aksi halde hiçbir şey render edilmez).
  visible: boolean;
  // Preview limiti aşıldı / yükleniyor → buton pasif.
  disabled: boolean;
  controller: VariantGenerationController;
  labels: GenerateVariantsActionLabels;
}

export function GenerateVariantsAction({
  visible,
  disabled,
  controller,
  labels,
}: GenerateVariantsActionProps) {
  if (!visible) return null;
  const { generating, summary, errorCode, generate } = controller;

  return (
    <div className="space-y-4 rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1 h-4 w-0.5 shrink-0 rounded-full bg-indigo-500/150" />
        <div>
          <h3 className="text-sm font-semibold text-white/90">{labels.sectionTitle}</h3>
          <p className="mt-0.5 text-xs text-white/45">{labels.sectionSubtitle}</p>
        </div>
      </div>

      <Button
        variant="primary"
        size="sm"
        onClick={() => void generate()}
        disabled={disabled || generating}
      >
        {generating ? labels.generating : labels.button}
      </Button>

      {errorCode ? (
        <Alert tone="error">{labels.serverErrors[errorCode] ?? labels.serverErrors.default}</Alert>
      ) : null}

      {summary ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-semibold text-white/70">{labels.summaryTitle}</p>
          <ul className="flex flex-wrap gap-1.5 text-xs text-white/60">
            <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              {labels.createdLabel(summary.created)}
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              {labels.keptLabel(summary.kept)}
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              {labels.restoredLabel(summary.restored)}
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              {labels.archivedLabel(summary.archived)}
            </li>
            {summary.manualVariantsUntouched > 0 ? (
              <li className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
                {labels.manualLabel(summary.manualVariantsUntouched)}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
