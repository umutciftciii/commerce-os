/**
 * TODO-152 (ADR-076) — Inventory Engine · PREVIEW ORKESTRASYONU (SAF ÇEKİRDEK).
 *
 * Kapsamdaki varyantların GÜNCEL bakiyesinden HEDEF bakiyeyi üretir (rule veya direct-edit),
 * hesaplar (availability/durum/oran), doğrular (blocking/warning) ve alan-bazlı diff'ler.
 * Deterministik: Prisma/HTTP/Date/Math.random BİLMEZ; girdi sırasından bağımsız fingerprint üretir
 * → preview == apply. Karmaşıklık: O(n·f); nested varyant-varyant karşılaştırması YOK.
 *
 * blocked = herhangi bir kapsam-varyantında blocking issue (negatif/overflow). Warning apply'ı
 * ENGELLEMEZ. `reserved` HEDEFTE değişmez (sistem-kontrollü; rule/edit reserved yazamaz).
 */

import { computeCalc } from "./calculator.js";
import { diffState } from "./diff-engine.js";
import { inventoryFingerprint } from "./fingerprint.js";
import { validateTarget } from "./validation.js";
import {
  BLOCKING_ISSUE_CODES,
  DEFAULT_INVENTORY_LIMITS,
  type InventoryCalc,
  type InventoryDirectEdit,
  type InventoryField,
  type InventoryIssueCode,
  type InventoryLimits,
  type InventoryRule,
  type InventoryState,
  type InventoryVariantInput,
  type VariantStatus,
} from "./types.js";

export type InventoryMode =
  | { kind: "rule"; rule: InventoryRule }
  | { kind: "direct"; edits: InventoryDirectEdit[] };

export interface PreviewInput {
  warehouseId: string;
  /** Kapsamdaki varyantlar (servis sıralar/filtreler: non-archived + selection). */
  variants: InventoryVariantInput[];
  mode: InventoryMode;
  limits?: InventoryLimits;
}

export interface PreviewRow {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  attributes: { code: string; label: string }[];
  balanceExists: boolean;
  current: InventoryState;
  currentCalc: InventoryCalc;
  target: InventoryState;
  targetCalc: InventoryCalc;
  changedFields: InventoryField[];
  changed: boolean;
  warnings: InventoryIssueCode[];
  errors: InventoryIssueCode[];
}

export interface PreviewSummary {
  totalVariants: number;
  changedVariants: number;
  unchangedVariants: number;
  changedFieldCount: number;
  warningCount: number;
  errorCount: number;
  /** onHand toplam değişimi (hedef − güncel; değişen satırlarda). */
  totalOnHandDelta: number;
  /** sellableAvailable toplam değişimi. */
  totalSellableDelta: number;
  /** Apply sonrası düşük stokta kalacak varyant (LOW_STOCK). */
  lowStockCount: number;
  /** Apply sonrası stoksuz kalacak varyant (OUT_OF_STOCK | INCOMING | NEGATIVE). */
  outOfStockCount: number;
  /** Apply'da yeni oluşacak balance sayısı. */
  newBalanceCount: number;
}

export interface PreviewOutput {
  fingerprint: string;
  warehouseId: string;
  rows: PreviewRow[];
  blocked: boolean;
  summary: PreviewSummary;
}

const clampToInt = (v: number): number => Math.trunc(v);

/** SAF rule uygulaması → hedef state (yalnız targetField değişir; sonuç < 0 clamp EDİLMEZ — validation
 * blocking verir). reserved ASLA değişmez. */
export function applyRuleToState(current: InventoryState, rule: InventoryRule): InventoryState {
  const amount = clampToInt(rule.amount);
  const fieldKey = ruleFieldKey(rule.targetField);
  const base = current[fieldKey];
  let next: number;
  switch (rule.operation) {
    case "SET_ABSOLUTE":
      next = amount;
      break;
    case "INCREASE":
      next = base + amount;
      break;
    case "DECREASE":
      next = base - amount;
      break;
    default:
      next = base;
  }
  return { ...current, [fieldKey]: next };
}

/** SAF direct-edit uygulaması (verilmeyen alan = dokunma; reserved YOK). */
export function applyDirectEdit(current: InventoryState, edit: InventoryDirectEdit): InventoryState {
  return {
    ...current,
    onHand: edit.onHand !== undefined ? clampToInt(edit.onHand) : current.onHand,
    incoming: edit.incoming !== undefined ? clampToInt(edit.incoming) : current.incoming,
    safetyStock: edit.safetyStock !== undefined ? clampToInt(edit.safetyStock) : current.safetyStock,
    reorderPoint:
      edit.reorderPoint !== undefined ? clampToInt(edit.reorderPoint) : current.reorderPoint,
  };
}

function ruleFieldKey(field: InventoryField): "onHand" | "incoming" | "safetyStock" | "reorderPoint" {
  switch (field) {
    case "ON_HAND":
      return "onHand";
    case "INCOMING":
      return "incoming";
    case "SAFETY_STOCK":
      return "safetyStock";
    case "REORDER_POINT":
      return "reorderPoint";
  }
}

function splitIssues(issues: InventoryIssueCode[]): {
  warnings: InventoryIssueCode[];
  errors: InventoryIssueCode[];
} {
  const warnings: InventoryIssueCode[] = [];
  const errors: InventoryIssueCode[] = [];
  for (const code of issues) {
    if (BLOCKING_ISSUE_CODES.has(code)) errors.push(code);
    else warnings.push(code);
  }
  return { warnings, errors };
}

export function buildInventoryPreview(input: PreviewInput): PreviewOutput {
  const limits = input.limits ?? DEFAULT_INVENTORY_LIMITS;
  const variants = input.variants;

  const editMap =
    input.mode.kind === "direct"
      ? new Map(input.mode.edits.map((e) => [e.variantId, e]))
      : null;

  const rows: PreviewRow[] = [];
  let blocked = false;

  let changedVariants = 0;
  let changedFieldCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let totalOnHandDelta = 0;
  let totalSellableDelta = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let newBalanceCount = 0;

  for (const v of variants) {
    // Hedef durumu üret (reserved DEĞİŞMEZ — rule/edit yalnız düzenlenebilir alanlara dokunur).
    let target: InventoryState;
    if (input.mode.kind === "rule") {
      target = applyRuleToState(v.current, input.mode.rule);
    } else {
      const edit = editMap!.get(v.variantId);
      target = edit ? applyDirectEdit(v.current, edit) : v.current;
    }

    const diff = diffState(v.current, target);
    const issues = validateTarget(v.current, target, {
      status: v.status,
      changed: diff.changed,
      newBalance: !v.balanceExists,
      limits,
    });
    const { warnings, errors } = splitIssues(issues);
    if (errors.length > 0) blocked = true;

    const currentCalc = computeCalc(v.current, v.balanceExists);
    const targetCalc = computeCalc(target, true); // hedef → balance var sayılır (apply oluşturur)

    if (diff.changed) {
      changedVariants++;
      changedFieldCount += diff.changedFields.length;
      totalOnHandDelta += target.onHand - v.current.onHand;
      totalSellableDelta += targetCalc.sellableAvailable - currentCalc.sellableAvailable;
    }
    if (!v.balanceExists) newBalanceCount++;
    if (targetCalc.status === "LOW_STOCK") lowStockCount++;
    if (
      targetCalc.status === "OUT_OF_STOCK" ||
      targetCalc.status === "INCOMING" ||
      targetCalc.status === "NEGATIVE"
    ) {
      outOfStockCount++;
    }
    warningCount += warnings.length;
    errorCount += errors.length;

    rows.push({
      variantId: v.variantId,
      sku: v.sku,
      title: v.title,
      status: v.status,
      attributes: v.attributes,
      balanceExists: v.balanceExists,
      current: v.current,
      currentCalc,
      target,
      targetCalc,
      changedFields: diff.changedFields,
      changed: diff.changed,
      warnings,
      errors,
    });
  }

  const fingerprint = inventoryFingerprint(
    variants.map((v) => ({ warehouseId: input.warehouseId, variantId: v.variantId, state: v.current })),
  );

  const summary: PreviewSummary = {
    totalVariants: variants.length,
    changedVariants,
    unchangedVariants: variants.length - changedVariants,
    changedFieldCount,
    warningCount,
    errorCount,
    totalOnHandDelta,
    totalSellableDelta,
    lowStockCount,
    outOfStockCount,
    newBalanceCount,
  };

  return { fingerprint, warehouseId: input.warehouseId, rows, blocked, summary };
}
