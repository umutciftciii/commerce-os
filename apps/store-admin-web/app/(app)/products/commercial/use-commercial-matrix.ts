"use client";

// TODO-151 (ADR-074) — Commercial Engine hook'u (Price / Compare-at / Cost / VAT).
//
// Matris GET ile mevcut ticari değerleri yükler. Kullanıcı ya hücreleri yerel düzenler (direct-edit
// draft; autosave YOK) ya da toplu kural kurar. "Önizle" sunucudan DETERMİNİSTİK preview çeker (yalnız-
// okuma). "Uygula" server-authoritative'dir: sunucu preview'i tek transaction'da yeniden hesaplar,
// stale-guard uygular ve yalnız değişen alanları yazar. Blocking (errors) iken apply pasiftir.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CommercialApplyRequest,
  CommercialDirectEdit,
  CommercialField,
  CommercialOperation,
  CommercialPreviewResponse,
  CommercialRule,
} from "@commerce-os/api-client";
import { storeApi, UiError } from "../../../../lib/client/api";
import { inputToMinor } from "../../../../lib/client/format";

export type MatrixField = "price" | "compareAt" | "cost" | "vat";

/** Bir varyantın yerel taslak (kaydedilmemiş) hücre değerleri. String; boş = dokunma. */
export interface DraftCells {
  price?: string;
  compareAt?: string;
  cost?: string;
  vat?: string; // bps string
}

export interface RuleFormState {
  targetField: CommercialField;
  operation: CommercialOperation;
  /** Yüzde (ör. "10", "12.5") veya para (ör. "250,00") — operasyona göre yorumlanır. */
  amount: string;
  vatBps: number;
  roundingMode: "NONE" | "NEAREST" | "UP" | "DOWN";
  roundingStep: 1 | 10 | 100 | 1000;
  priceEnding: "END_90" | "END_99" | "END_990" | "END_9990";
}

export type PanelMode = "direct" | "rule";

export interface CommercialMatrixController {
  // Matris (current)
  matrix: CommercialPreviewResponse | null;
  matrixLoading: boolean;
  matrixError: string | null;
  reloadMatrix: () => void;

  // Panel modu
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;

  // Seçim
  selectedIds: Set<string>;
  toggleSelect: (variantId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  /** Seçimi verilen kümeye ayarlar (ör. "yalnız aktif varyantlar"). */
  setSelection: (variantIds: string[]) => void;

  // Direct edit taslağı
  drafts: Map<string, DraftCells>;
  setCell: (variantId: string, field: MatrixField, value: string) => void;
  hasDraft: boolean;
  clearDrafts: () => void;

  // Bulk rule formu
  ruleForm: RuleFormState;
  setRuleForm: (patch: Partial<RuleFormState>) => void;
  amountKind: "percent" | "money" | "vat" | "none";

  // Preview
  preview: CommercialPreviewResponse | null;
  previewLoading: boolean;
  previewError: string | null;
  runPreview: () => Promise<void>;
  clearPreview: () => void;

  // Apply
  applying: boolean;
  applyError: string | null;
  applySummary: { updatedVariants: number; updatedFields: number } | null;
  apply: () => Promise<void>;
}

const DEFAULT_RULE: RuleFormState = {
  targetField: "PRICE",
  operation: "INCREASE_PERCENT",
  amount: "",
  vatBps: 2000,
  roundingMode: "NONE",
  roundingStep: 10,
  priceEnding: "END_90",
};

const PERCENT_OPS: CommercialOperation[] = [
  "INCREASE_PERCENT",
  "DECREASE_PERCENT",
  "SET_FROM_COST_MARKUP",
  "SET_COMPARE_AT_FROM_PRICE",
];
const MONEY_OPS: CommercialOperation[] = ["SET_FIXED", "INCREASE_FIXED", "DECREASE_FIXED"];

// "10" / "12.5" / "12,5" → bps (integer). Geçersiz → null.
function percentToBps(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function useCommercialMatrix(productId: string | null): CommercialMatrixController {
  const [matrix, setMatrix] = useState<CommercialPreviewResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // TODO-151A — Varsayılan mod "Hızlı düzenleme" (direct); günlük kullanıcı için en kolay akış.
  const [mode, setMode] = useState<PanelMode>("direct");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Map<string, DraftCells>>(new Map());
  const [ruleForm, setRuleFormState] = useState<RuleFormState>(DEFAULT_RULE);

  const [preview, setPreview] = useState<CommercialPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<{ updatedVariants: number; updatedFields: number } | null>(null);

  // Matris yükle.
  useEffect(() => {
    if (!productId) {
      setMatrix(null);
      return;
    }
    setMatrixLoading(true);
    setMatrixError(null);
    // Promise.resolve sarmalı: fetch senkron atarsa (ör. ağ/erişim) formu çökertmez, error state'e düşer.
    Promise.resolve()
      .then(() => storeApi.getCommercialMatrix(productId))
      .then((data) => {
        setMatrix(data);
        setMatrixLoading(false);
      })
      .catch((error: unknown) => {
        setMatrixError(error instanceof UiError ? error.code : "ERROR");
        setMatrixLoading(false);
      });
  }, [productId, refreshToken]);

  const reloadMatrix = useCallback(() => setRefreshToken((t) => t + 1), []);

  const setRuleForm = useCallback((patch: Partial<RuleFormState>) => {
    setRuleFormState((prev) => ({ ...prev, ...patch }));
    setPreview(null);
    setApplySummary(null);
  }, []);

  const toggleSelect = useCallback((variantId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
    setPreview(null);
  }, []);
  const selectAll = useCallback(() => {
    setSelectedIds(new Set((matrix?.rows ?? []).map((r) => r.variantId)));
    setPreview(null);
  }, [matrix]);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setPreview(null);
  }, []);
  const setSelection = useCallback((variantIds: string[]) => {
    setSelectedIds(new Set(variantIds));
    setPreview(null);
  }, []);

  const setCell = useCallback((variantId: string, field: MatrixField, value: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const cell = { ...(next.get(variantId) ?? {}) };
      cell[field] = value;
      next.set(variantId, cell);
      return next;
    });
    setPreview(null);
    setApplySummary(null);
  }, []);
  const clearDrafts = useCallback(() => {
    setDrafts(new Map());
    setPreview(null);
  }, []);
  const hasDraft = useMemo(
    () => [...drafts.values()].some((c) => Object.values(c).some((v) => v !== undefined && v.trim() !== "")),
    [drafts],
  );

  const amountKind: CommercialMatrixController["amountKind"] = useMemo(() => {
    if (ruleForm.operation === "SET_FIXED" && ruleForm.targetField === "VAT_RATE") return "vat";
    if (PERCENT_OPS.includes(ruleForm.operation)) return "percent";
    if (MONEY_OPS.includes(ruleForm.operation)) return "money";
    return "none";
  }, [ruleForm.operation, ruleForm.targetField]);

  // Rule formundan yapısal CommercialRule kur (istemci-tarafı hata → previewError).
  const buildRule = useCallback((): CommercialRule | { error: string } => {
    const { targetField, operation } = ruleForm;
    const rule: CommercialRule = { targetField, operation };
    if (operation === "ROUND") {
      if (ruleForm.roundingMode === "NONE") return { error: "COMMERCIAL_INVALID_RULE" };
      rule.rounding = { mode: ruleForm.roundingMode, step: ruleForm.roundingStep };
      return rule;
    }
    if (operation === "SET_PRICE_ENDING") {
      rule.priceEnding = ruleForm.priceEnding;
      return rule;
    }
    if (amountKind === "vat") {
      rule.valueBps = ruleForm.vatBps;
      return rule;
    }
    if (amountKind === "percent") {
      const bps = percentToBps(ruleForm.amount);
      if (bps === null) return { error: "COMMERCIAL_INVALID_AMOUNT" };
      rule.percentBps = bps;
      return rule;
    }
    // money
    const minor = inputToMinor(ruleForm.amount);
    if (minor === null) return { error: "COMMERCIAL_INVALID_AMOUNT" };
    rule.valueMinor = minor;
    // Değer-üreten opsyona opsiyonel son-yuvarlama.
    if (ruleForm.roundingMode !== "NONE") rule.rounding = { mode: ruleForm.roundingMode, step: ruleForm.roundingStep };
    return rule;
  }, [ruleForm, amountKind]);

  // Draft taslağından direct-edit listesi kur.
  const buildEdits = useCallback((): CommercialDirectEdit[] | { error: string } => {
    const edits: CommercialDirectEdit[] = [];
    for (const [variantId, cell] of drafts) {
      const edit: CommercialDirectEdit = { variantId };
      let touched = false;
      if (cell.price !== undefined && cell.price.trim() !== "") {
        const m = inputToMinor(cell.price);
        if (m === null) return { error: "COMMERCIAL_INVALID_AMOUNT" };
        edit.priceMinor = m;
        touched = true;
      }
      if (cell.compareAt !== undefined && cell.compareAt.trim() !== "") {
        const m = inputToMinor(cell.compareAt);
        if (m === null) return { error: "COMMERCIAL_INVALID_AMOUNT" };
        edit.compareAtMinor = m;
        touched = true;
      }
      if (cell.cost !== undefined && cell.cost.trim() !== "") {
        const m = inputToMinor(cell.cost);
        if (m === null) return { error: "COMMERCIAL_INVALID_AMOUNT" };
        edit.costMinor = m;
        touched = true;
      }
      if (cell.vat !== undefined && cell.vat.trim() !== "") {
        edit.vatRateBps = Number.parseInt(cell.vat, 10);
        touched = true;
      }
      if (touched) edits.push(edit);
    }
    return edits;
  }, [drafts]);

  const buildRequest = useCallback(():
    | { rule?: CommercialRule; edits?: CommercialDirectEdit[]; selectedVariantIds?: string[] }
    | { error: string } => {
    const selectedVariantIds = selectedIds.size > 0 ? [...selectedIds] : undefined;
    if (mode === "rule") {
      const rule = buildRule();
      if ("error" in rule) return rule;
      return { rule, selectedVariantIds };
    }
    const edits = buildEdits();
    if ("error" in edits) return edits;
    return { edits };
  }, [mode, buildRule, buildEdits, selectedIds]);

  const runPreview = useCallback(async () => {
    if (!productId) return;
    const req = buildRequest();
    if ("error" in req) {
      setPreviewError(req.error);
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setApplySummary(null);
    try {
      const result = await storeApi.previewCommercial(productId, req);
      setPreview(result);
      setPreviewLoading(false);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof UiError ? error.code : "ERROR");
      setPreviewLoading(false);
    }
  }, [productId, buildRequest]);

  const clearPreview = useCallback(() => setPreview(null), []);

  const apply = useCallback(async () => {
    if (!productId || !preview || preview.blocked) return;
    const req = buildRequest();
    if ("error" in req) {
      setApplyError(req.error);
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const payload: CommercialApplyRequest = { ...req, baseFingerprint: preview.fingerprint };
      const result = await storeApi.applyCommercial(productId, payload);
      setApplySummary({ updatedVariants: result.updatedVariants, updatedFields: result.updatedFields });
      setApplying(false);
      setPreview(null);
      setDrafts(new Map());
      reloadMatrix();
    } catch (error) {
      setApplyError(error instanceof UiError ? error.code : "ERROR");
      setApplying(false);
      reloadMatrix(); // sunucu durumunu yeniden yansıt (stale/conflict sonrası)
    }
  }, [productId, preview, buildRequest, reloadMatrix]);

  return {
    matrix,
    matrixLoading,
    matrixError,
    reloadMatrix,
    mode,
    setMode: (m) => {
      setMode(m);
      setPreview(null);
      setApplySummary(null);
    },
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    setSelection,
    drafts,
    setCell,
    hasDraft,
    clearDrafts,
    ruleForm,
    setRuleForm,
    amountKind,
    preview,
    previewLoading,
    previewError,
    runPreview,
    clearPreview,
    applying,
    applyError,
    applySummary,
    apply,
  };
}
