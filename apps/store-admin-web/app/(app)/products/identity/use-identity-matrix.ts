"use client";

// TODO-150 (ADR-073) — Identity Management Engine hook'u (SKU/Barcode/Title pattern motoru).
//
// Kullanıcı pattern yazınca (debounce) sunucudan DETERMİNİSTİK preview çeker (yalnız-okuma; hiçbir
// varyant yazılmaz). Apply server-authoritative'dir: sunucu preview'i yeniden hesaplar ve yalnız
// değişen varyantları tek transaction'da yazar. Blocked (collision/validation) iken apply pasiftir.

import { useCallback, useEffect, useRef, useState } from "react";
import type { IdentityApplyRequest, IdentityPreviewResponse } from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";

export interface IdentityPatternsState {
  sku: string;
  barcode: string;
  title: string;
  seqStart: number;
  regenerateCustomTitles: boolean;
}

export interface IdentityMatrixController {
  patterns: IdentityPatternsState;
  setPattern: (field: "sku" | "barcode" | "title", value: string) => void;
  setSeqStart: (value: number) => void;
  setRegenerateCustomTitles: (value: boolean) => void;
  preview: IdentityPreviewResponse | null;
  previewLoading: boolean;
  // Sunucu stable kodu (IDENTITY_PATTERN_INVALID, ...) veya "ERROR"; hata yoksa null.
  previewError: string | null;
  applying: boolean;
  applyError: string | null;
  applySummary: { updated: number; skipped: number } | null;
  apply: () => Promise<void>;
  /** Pattern verilmiş mi (en az biri dolu). */
  hasPattern: boolean;
}

const IDLE_PATTERNS: IdentityPatternsState = {
  sku: "",
  barcode: "",
  title: "",
  seqStart: 1,
  regenerateCustomTitles: false,
};

const DEBOUNCE_MS = 400;

function toQuery(p: IdentityPatternsState): IdentityApplyRequest {
  return {
    sku: p.sku.trim() ? p.sku : undefined,
    barcode: p.barcode.trim() ? p.barcode : undefined,
    title: p.title.trim() ? p.title : undefined,
    seqStart: p.seqStart,
    regenerateCustomTitles: p.regenerateCustomTitles || undefined,
  };
}

export function useIdentityMatrix(
  productId: string | null,
  onApplied?: () => void,
): IdentityMatrixController {
  const [patterns, setPatterns] = useState<IdentityPatternsState>(IDLE_PATTERNS);
  const [preview, setPreview] = useState<IdentityPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<{ updated: number; skipped: number } | null>(null);
  // Apply sonrası preview'i tazelemek için token.
  const [refreshToken, setRefreshToken] = useState(0);

  const hasPattern =
    patterns.sku.trim().length > 0 ||
    patterns.barcode.trim().length > 0 ||
    patterns.title.trim().length > 0;

  const setPattern = useCallback((field: "sku" | "barcode" | "title", value: string) => {
    setPatterns((prev) => ({ ...prev, [field]: value }));
    setApplySummary(null);
  }, []);
  const setSeqStart = useCallback((value: number) => {
    setPatterns((prev) => ({ ...prev, seqStart: Number.isFinite(value) && value >= 0 ? value : 0 }));
    setApplySummary(null);
  }, []);
  const setRegenerateCustomTitles = useCallback((value: boolean) => {
    setPatterns((prev) => ({ ...prev, regenerateCustomTitles: value }));
    setApplySummary(null);
  }, []);

  // Debounced preview. Pattern boşsa temizle.
  const latestRequest = useRef(0);
  useEffect(() => {
    if (!productId || !hasPattern) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const requestId = ++latestRequest.current;
    setPreviewLoading(true);
    const handle = setTimeout(() => {
      storeApi
        .getIdentityPreview(productId, toQuery(patterns))
        .then((data) => {
          if (requestId !== latestRequest.current) return; // stale
          setPreview(data);
          setPreviewError(null);
          setPreviewLoading(false);
        })
        .catch((error: unknown) => {
          if (requestId !== latestRequest.current) return;
          setPreview(null);
          setPreviewError(error instanceof UiError ? error.code : "ERROR");
          setPreviewLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [productId, patterns, hasPattern, refreshToken]);

  const apply = useCallback(async () => {
    if (!productId || !hasPattern) return;
    setApplying(true);
    setApplyError(null);
    setApplySummary(null);
    try {
      const result = await storeApi.applyIdentity(productId, toQuery(patterns));
      setApplySummary({ updated: result.updated, skipped: result.skipped });
      setApplying(false);
      setRefreshToken((t) => t + 1); // preview'i tazele (değişiklikler artık current)
      onApplied?.();
    } catch (error) {
      setApplyError(error instanceof UiError ? error.code : "ERROR");
      setApplying(false);
      setRefreshToken((t) => t + 1); // sunucu durumunu yeniden yansıt
    }
  }, [productId, hasPattern, patterns, onApplied]);

  return {
    patterns,
    setPattern,
    setSeqStart,
    setRegenerateCustomTitles,
    preview,
    previewLoading,
    previewError,
    applying,
    applyError,
    applySummary,
    apply,
    hasPattern,
  };
}
