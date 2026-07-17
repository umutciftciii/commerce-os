"use client";

// Faz 2C-2 (ADR-071) — Combination Engine ÖNİZLEME hook'u.
//
// Ürünün KALICI varyant eksen reçetesinden ÜRETİLECEK kombinasyonları sunucudan (SAF motor)
// okur. Yalnız DÜZENLEME modunda anlamlıdır (productId gerekir + seçim kaydedilmiş olmalı);
// yeni üründe (henüz kaydedilmemiş) önizleme yoktur. Önizleme SUNUCU-OTORİTERDİR: canonical
// ordering + guard motordadır. HİÇBİR ŞEY YAZMAZ.
//
// `refreshToken` her başarılı kaydetmede artırılır → önizleme güncel kalıcı seçimi yansıtır.

import { useEffect, useState } from "react";
import type { VariantCombinationPreviewResponse } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";

export interface VariantCombinationPreviewState {
  loading: boolean;
  data: VariantCombinationPreviewResponse | null;
  // Guard aşımında "PREVIEW_LIMIT_EXCEEDED", diğer hatalarda "ERROR", hata yoksa null.
  errorCode: "PREVIEW_LIMIT_EXCEEDED" | "ERROR" | null;
}

const IDLE: VariantCombinationPreviewState = { loading: false, data: null, errorCode: null };

export function useVariantCombinationPreview(
  productId: string | null,
  refreshToken: number,
): VariantCombinationPreviewState {
  const [state, setState] = useState<VariantCombinationPreviewState>(IDLE);

  useEffect(() => {
    // Yeni ürün (kaydedilmemiş) → önizleme yok.
    if (!productId) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ loading: true, data: null, errorCode: null });
    storeApi
      .getVariantCombinationPreview(productId)
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, errorCode: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code =
          error instanceof UiError && error.code === "PREVIEW_LIMIT_EXCEEDED"
            ? "PREVIEW_LIMIT_EXCEEDED"
            : "ERROR";
        setState({ loading: false, data: null, errorCode: code });
      });
    return () => {
      cancelled = true;
    };
  }, [productId, refreshToken]);

  return state;
}
