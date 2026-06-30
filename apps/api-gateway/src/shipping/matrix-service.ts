/**
 * F3C.4 — Tarife matrisi + CSV import servisi (SAF fonksiyonlar).
 *
 * TEMEL KARAR (ADR-044 / F3C.4): Gercek kargo fiyat listeleri (DHL desi x Tarife
 * I/II/III, Aras desi/kg x zone) satir-satir kural eklemek yerine matris/grid
 * mantigiyla girilir. Backend AUTHORITATIVE: frontend yalniz grid gonderir; bu
 * modul grid'i mevcut kurallarla karsilastirip CREATE/UPDATE/UNCHANGED/EMPTY
 * planlar. Yalniz UPSERT: eslesen kural update, yoksa create; bos hucre kural
 * olusturmaz ve mevcudu SILMEZ; matris kapsami disindaki ozel/gelismis kurallar
 * (cityCode/districtCode/regionCode dolu veya tier+zone birlikte) KORUNUR.
 *
 * Saf tutulur (prisma/fastify import ETMEZ) — price-engine gibi tek basina test
 * edilir; DB yazimi route katmanindaki transaction'da plannedOps ile yapilir.
 */
import type {
  ShippingChargeType,
  ShippingMatrixAxis,
  ShippingMatrixCellDiff,
  ShippingMatrixError,
  ShippingMatrixMode,
  ShippingMatrixRowInput,
  ShippingMatrixSummary,
} from "@commerce-os/contracts";

/** Mevcut kuralin matris eslesmesi/esitligi icin gereken minimal sekli. */
export interface MatrixExistingRule {
  id: string;
  tierId: string | null;
  zoneId: string | null;
  minDesi: number | null;
  maxDesi: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  cityCode: string | null;
  districtCode: string | null;
  regionCode: string | null;
  chargeType: ShippingChargeType;
  amountMinor: number | null;
  unitAmountMinor: number | null;
  baseAmountMinor: number | null;
  baseThreshold: number | null;
}

/** Bir hucrenin DB'ye yazilacak kural verisi (prisma create/update alanlari). */
export interface MatrixRuleData {
  tierId: string | null;
  zoneId: string | null;
  minDesi: number | null;
  maxDesi: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  chargeType: ShippingChargeType;
  amountMinor: number | null;
  unitAmountMinor: number | null;
  baseAmountMinor: number | null;
  baseThreshold: number | null;
  sortOrder: number;
}

export type MatrixPlannedOp =
  | { action: "CREATE"; data: MatrixRuleData }
  | { action: "UPDATE"; ruleId: string; data: MatrixRuleData };

export interface MatrixDiffResult {
  valid: boolean;
  summary: ShippingMatrixSummary;
  cells: ShippingMatrixCellDiff[];
  errors: ShippingMatrixError[];
  /** Route transaction'inin uygulayacagi islemler (CREATE/UPDATE; UNCHANGED/EMPTY yok). */
  plannedOps: MatrixPlannedOp[];
}

export interface BuildMatrixDiffParams {
  mode: ShippingMatrixMode;
  axis: ShippingMatrixAxis;
  rows: ShippingMatrixRowInput[];
  existingRules: MatrixExistingRule[];
}

/**
 * TR ondalik ham metni minor unit (kurus) tam sayisina cevirir. Bos => null (bos
 * hucre). Gecersiz => { ok:false }. Kabul: "116,99", "116.99", "₺116,99", "1.234,56"
 * (nokta binlik / virgul ondalik), "1234.56". Negatif reddedilir.
 */
export function parseTrDecimalToMinor(raw: string): { ok: true; minor: number | null } | { ok: false } {
  const cleaned = raw.replace(/[₺\s]/g, "").trim();
  if (cleaned.length === 0) return { ok: true, minor: null };
  let normalized: string;
  if (cleaned.includes(".") && cleaned.includes(",")) {
    // Hem nokta hem virgul: nokta binlik, virgul ondalik (TR yazimi).
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { ok: false };
  const asFloat = Number.parseFloat(normalized);
  if (Number.isNaN(asFloat) || asFloat < 0) return { ok: false };
  return { ok: true, minor: Math.round(asFloat * 100) };
}

/** Iki acik-uclu araligin (null = sonsuz) kesisip kesismedigi. */
function bracketsOverlap(aMin: number | null, aMax: number | null, bMin: number | null, bMax: number | null): boolean {
  const lo1 = aMin ?? Number.NEGATIVE_INFINITY;
  const hi1 = aMax ?? Number.POSITIVE_INFINITY;
  const lo2 = bMin ?? Number.NEGATIVE_INFINITY;
  const hi2 = bMax ?? Number.POSITIVE_INFINITY;
  return lo1 < hi2 && lo2 < hi1;
}

/** Mevcut kural matris kapsaminda mi (yalniz tier VEYA zone; geo bos). */
function isMatrixScoped(rule: MatrixExistingRule, mode: ShippingMatrixMode): boolean {
  if (rule.cityCode !== null || rule.districtCode !== null || rule.regionCode !== null) return false;
  if (mode === "SEGMENT") return rule.zoneId === null;
  return rule.tierId === null;
}

/** Mevcut kural (mode/axis) bu kolon+bracket hucresine mi ait. */
function ruleMatchesCell(
  rule: MatrixExistingRule,
  mode: ShippingMatrixMode,
  axis: ShippingMatrixAxis,
  columnId: string,
  min: number | null,
  max: number | null,
): boolean {
  if (!isMatrixScoped(rule, mode)) return false;
  const columnMatch = mode === "SEGMENT" ? rule.tierId === columnId : rule.zoneId === columnId;
  if (!columnMatch) return false;
  const ruleMin = axis === "DESI" ? rule.minDesi : rule.minWeightKg;
  const ruleMax = axis === "DESI" ? rule.maxDesi : rule.maxWeightKg;
  return ruleMin === min && ruleMax === max;
}

/** Mevcut kuralin fiyat alanlari hedefle birebir ayni mi (UNCHANGED karari). */
function ruleEqualsDesired(rule: MatrixExistingRule, data: MatrixRuleData): boolean {
  return (
    rule.chargeType === data.chargeType &&
    rule.amountMinor === data.amountMinor &&
    rule.unitAmountMinor === data.unitAmountMinor &&
    rule.baseAmountMinor === data.baseAmountMinor &&
    rule.baseThreshold === data.baseThreshold
  );
}

/**
 * Grid'i mevcut kurallarla karsilastirip diff + plannedOps uretir. DB'ye yazmaz.
 * Hata varsa valid=false (route apply'i reddeder); preview yine de doner.
 */
export function buildMatrixDiff(params: BuildMatrixDiffParams): MatrixDiffResult {
  const { mode, axis, rows, existingRules } = params;
  const cells: ShippingMatrixCellDiff[] = [];
  const errors: ShippingMatrixError[] = [];
  const plannedOps: MatrixPlannedOp[] = [];
  const summary: ShippingMatrixSummary = { create: 0, update: 0, unchanged: 0, empty: 0 };

  // Satir araliklari kendi icinde cakismamali (deterministik bracket secimi).
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i];
    if (a.min !== null && a.max !== null && a.min > a.max) {
      errors.push({ rowIndex: i, columnId: null, code: "INVALID_RANGE", message: "Geçersiz aralık: min, max'tan büyük olamaz." });
    }
    for (let j = i + 1; j < rows.length; j += 1) {
      const b = rows[j];
      if (bracketsOverlap(a.min, a.max, b.min, b.max)) {
        errors.push({ rowIndex: j, columnId: null, code: "RANGE_OVERLAP", message: "Aralık başka bir satırla çakışıyor." });
        break;
      }
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const isOver = row.max === null;
    for (const cell of row.cells) {
      const negativeBase = cell.baseAmountMinor != null && cell.baseAmountMinor < 0;
      if ((cell.amountMinor != null && cell.amountMinor < 0) || negativeBase) {
        errors.push({ rowIndex, columnId: cell.columnId, code: "NEGATIVE_PRICE", message: "Fiyat negatif olamaz." });
      }

      if (cell.amountMinor == null) {
        // Bos hucre: kural olusturmaz, mevcudu silmez (yalniz upsert).
        cells.push({ rowIndex, columnId: cell.columnId, action: "EMPTY", existingRuleId: null, chargeType: null, amountMinor: null });
        summary.empty += 1;
        continue;
      }

      const data = buildRuleData(mode, axis, row, cell.columnId, cell.amountMinor, cell.baseAmountMinor ?? null, rowIndex, isOver);
      const existing = existingRules.find((r) => ruleMatchesCell(r, mode, axis, cell.columnId, row.min, row.max));

      if (existing) {
        if (ruleEqualsDesired(existing, data)) {
          cells.push({ rowIndex, columnId: cell.columnId, action: "UNCHANGED", existingRuleId: existing.id, chargeType: data.chargeType, amountMinor: cell.amountMinor });
          summary.unchanged += 1;
        } else {
          cells.push({ rowIndex, columnId: cell.columnId, action: "UPDATE", existingRuleId: existing.id, chargeType: data.chargeType, amountMinor: cell.amountMinor });
          summary.update += 1;
          plannedOps.push({ action: "UPDATE", ruleId: existing.id, data });
        }
      } else {
        cells.push({ rowIndex, columnId: cell.columnId, action: "CREATE", existingRuleId: null, chargeType: data.chargeType, amountMinor: cell.amountMinor });
        summary.create += 1;
        plannedOps.push({ action: "CREATE", data });
      }
    }
  }

  return { valid: errors.length === 0, summary, cells, errors, plannedOps };
}

/** Hucreyi generic chargeType kuraline donusturur (30+ satiri overflowBehavior'a gore). */
function buildRuleData(
  mode: ShippingMatrixMode,
  axis: ShippingMatrixAxis,
  row: ShippingMatrixRowInput,
  columnId: string,
  amountMinor: number,
  baseAmountMinor: number | null,
  rowIndex: number,
  isOver: boolean,
): MatrixRuleData {
  const tierId = mode === "SEGMENT" ? columnId : null;
  const zoneId = mode === "ZONE" ? columnId : null;
  const minDesi = axis === "DESI" ? row.min : null;
  const maxDesi = axis === "DESI" ? row.max : null;
  const minWeightKg = axis === "WEIGHT" ? row.min : null;
  const maxWeightKg = axis === "WEIGHT" ? row.max : null;
  const base = {
    tierId,
    zoneId,
    minDesi,
    maxDesi,
    minWeightKg,
    maxWeightKg,
    sortOrder: rowIndex,
  };

  // 30+/"ve uzeri" + esik ustu birim ucret => PER_ADDITIONAL_KG_OR_DESI.
  // Sabit toplam ucret (FIXED) ve normal satirlar => FLAT (maxDesi/maxWeightKg null = ve uzeri).
  if (isOver && row.overflowBehavior === "PER_ADDITIONAL") {
    return {
      ...base,
      chargeType: "PER_ADDITIONAL_KG_OR_DESI",
      amountMinor: null,
      unitAmountMinor: amountMinor,
      baseAmountMinor: baseAmountMinor ?? 0,
      baseThreshold: row.min ?? 0,
    };
  }
  return {
    ...base,
    chargeType: "FLAT",
    amountMinor,
    unitAmountMinor: null,
    baseAmountMinor: null,
    baseThreshold: null,
  };
}

/* ─────────────────────── CSV parse ─────────────────────── */

export interface CsvColumn {
  /** Normalize edilmis baslik anahtari (kucuk harf, trim). */
  key: string;
  columnId: string;
}

export interface ParsedMatrixGrid {
  rows: ShippingMatrixRowInput[];
  errors: ShippingMatrixError[];
}

/** Baslik/hucre normalize: kucuk harf + bosluk sadelestirme (TR-duyarsiz eslesme). */
export function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

/** Satirdaki ayraci sezer: once ';', sonra TAB, sonra ','. */
function detectDelimiter(headerLine: string): string {
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes("\t")) return "\t";
  return ",";
}

/**
 * CSV/paste metnini matris grid'ine cevirir. Format:
 *   desi_min,desi_max,<kolon1>,<kolon2>,...
 *   0,0,116.99,95.99
 * Ilk iki kolon min/max; kalan basliklar plan kolonlarina (tier adi / zone kodu)
 * eslenir. max bos => "ve uzeri" satiri. Ayrac ';' veya TAB ise hucrelerde TR
 * virgullu ondalik (116,99) guvenle kullanilir.
 */
export function parseCsvToMatrix(csv: string, columns: CsvColumn[]): ParsedMatrixGrid {
  const errors: ShippingMatrixError[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    errors.push({ rowIndex: null, columnId: null, code: "CSV_EMPTY", message: "En az bir başlık ve bir veri satırı gerekir." });
    return { rows: [], errors };
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = lines[0].split(delimiter).map((h) => h.trim());
  if (header.length < 3) {
    errors.push({ rowIndex: null, columnId: null, code: "CSV_HEADER_INVALID", message: "Başlık: desi_min, desi_max ve en az bir kolon içermeli." });
    return { rows: [], errors };
  }

  // Baslik kolonlarini (3.'den itibaren) plan kolonlarina esle.
  const lookup = new Map(columns.map((c) => [c.key, c.columnId] as const));
  const columnIds: (string | null)[] = [];
  for (let c = 2; c < header.length; c += 1) {
    const matched = lookup.get(normalizeKey(header[c])) ?? null;
    if (matched === null) {
      errors.push({ rowIndex: null, columnId: null, code: "CSV_COLUMN_UNKNOWN", message: `Bilinmeyen kolon: "${header[c]}".` });
    }
    columnIds.push(matched);
  }

  const rows: ShippingMatrixRowInput[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const dataRowIndex = i - 1;
    const fields = lines[i].split(delimiter).map((f) => f.trim());
    const minParsed = parseTrDecimalToMinorRange(fields[0]);
    const maxParsed = parseTrDecimalToMinorRange(fields[1]);
    if (minParsed === "invalid" || maxParsed === "invalid") {
      errors.push({ rowIndex: dataRowIndex, columnId: null, code: "CSV_RANGE_INVALID", message: `Geçersiz desi aralığı: "${fields[0]}–${fields[1]}".` });
      continue;
    }
    const cells = columnIds.map((columnId, idx) => {
      const raw = fields[idx + 2] ?? "";
      const parsed = parseTrDecimalToMinor(raw);
      if (!parsed.ok) {
        errors.push({ rowIndex: dataRowIndex, columnId, code: "CSV_PRICE_INVALID", message: `Geçersiz fiyat: "${raw}".` });
        return { columnId: columnId ?? "", amountMinor: null };
      }
      return { columnId: columnId ?? "", amountMinor: parsed.minor };
    }).filter((c) => c.columnId.length > 0);

    rows.push({
      min: minParsed,
      max: maxParsed,
      overflowBehavior: "PER_ADDITIONAL",
      cells,
    });
  }

  return { rows, errors };
}

/** Aralik sinir hucresi: bos => null ("ve uzeri"/acik uc), gecersiz => "invalid". */
function parseTrDecimalToMinorRange(raw: string | undefined): number | null | "invalid" {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[₺\s]/g, "").trim();
  if (cleaned.length === 0) return null;
  const normalized = cleaned.includes(".") && cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return "invalid";
  const asFloat = Number.parseFloat(normalized);
  if (Number.isNaN(asFloat) || asFloat < 0) return "invalid";
  return asFloat;
}
