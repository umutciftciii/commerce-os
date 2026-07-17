"use client";

// Faz 2C-3 (ADR-072) — Kalıcı varyant ÜRETİMİ hook'u.
//
// Ürünün KALICI eksen reçetesinden ProductVariant kayıtlarını üretir (sunucu-otoriter: create/keep/
// restore/archive tek transaction). Gövdesiz POST — authoritative kaynak DB reçetesidir. Başarıda
// `onDone` çağrılır (product-form önizlemeyi yeniden fetch eder). Bu faz SKU Matrix DEĞİLDİR.

import { useCallback, useState } from "react";
import type { VariantGenerationResponse } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";

export interface VariantGenerationState {
  generating: boolean;
  summary: VariantGenerationResponse | null;
  // Sunucu stable error kodu (VARIANT_SELECTION_EMPTY, PREVIEW_LIMIT_EXCEEDED, ...) veya "ERROR".
  errorCode: string | null;
}

export interface VariantGenerationController extends VariantGenerationState {
  generate: () => Promise<void>;
  reset: () => void;
}

const IDLE: VariantGenerationState = { generating: false, summary: null, errorCode: null };

export function useVariantGeneration(
  productId: string | null,
  onDone?: () => void,
): VariantGenerationController {
  const [state, setState] = useState<VariantGenerationState>(IDLE);

  const generate = useCallback(async () => {
    if (!productId) return;
    setState({ generating: true, summary: null, errorCode: null });
    try {
      const summary = await storeApi.generateVariantCombinations(productId);
      setState({ generating: false, summary, errorCode: null });
      onDone?.();
    } catch (error) {
      const code = error instanceof UiError ? error.code : "ERROR";
      setState({ generating: false, summary: null, errorCode: code });
    }
  }, [productId, onDone]);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, generate, reset };
}
