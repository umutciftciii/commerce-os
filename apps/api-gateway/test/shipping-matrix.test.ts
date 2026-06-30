/**
 * F3C.4 — Tarife matrisi + CSV import birim testleri (saf fonksiyonlar).
 * Backend AUTHORITATIVE; yalniz upsert — matris kapsami disindaki kurallar korunur.
 */
import { describe, expect, it } from "vitest";
import {
  buildMatrixDiff,
  normalizeKey,
  parseCsvToMatrix,
  parseTrDecimalToMinor,
  type CsvColumn,
  type MatrixExistingRule,
} from "../src/shipping/matrix-service.js";
import type { ShippingMatrixRowInput } from "@commerce-os/contracts";

const TIER_I = "tier_1";
const TIER_II = "tier_2";

function row(min: number | null, max: number | null, cells: Record<string, number | null>, overflow: "FIXED" | "PER_ADDITIONAL" = "PER_ADDITIONAL"): ShippingMatrixRowInput {
  return {
    min,
    max,
    overflowBehavior: overflow,
    cells: Object.entries(cells).map(([columnId, amountMinor]) => ({ columnId, amountMinor })),
  };
}

function existing(partial: Partial<MatrixExistingRule> & { id: string }): MatrixExistingRule {
  return {
    tierId: null,
    zoneId: null,
    minDesi: null,
    maxDesi: null,
    minWeightKg: null,
    maxWeightKg: null,
    cityCode: null,
    districtCode: null,
    regionCode: null,
    chargeType: "FLAT",
    amountMinor: null,
    unitAmountMinor: null,
    baseAmountMinor: null,
    baseThreshold: null,
    ...partial,
  };
}

describe("parseTrDecimalToMinor", () => {
  it("TR ve EN ondalik biçimlerini kuruşa çevirir", () => {
    expect(parseTrDecimalToMinor("116,99")).toEqual({ ok: true, minor: 11699 });
    expect(parseTrDecimalToMinor("116.99")).toEqual({ ok: true, minor: 11699 });
    expect(parseTrDecimalToMinor("₺116,99")).toEqual({ ok: true, minor: 11699 });
    expect(parseTrDecimalToMinor("1.234,56")).toEqual({ ok: true, minor: 123456 });
  });
  it("boş hücreyi null döner, geçersizi reddeder", () => {
    expect(parseTrDecimalToMinor("")).toEqual({ ok: true, minor: null });
    expect(parseTrDecimalToMinor("  ")).toEqual({ ok: true, minor: null });
    expect(parseTrDecimalToMinor("abc")).toEqual({ ok: false });
    expect(parseTrDecimalToMinor("-5")).toEqual({ ok: false });
  });
});

describe("buildMatrixDiff — SEGMENT (DHL Tarife I/II/III)", () => {
  it("boş plana DHL matrisini CREATE olarak planlar", () => {
    const rows = [
      row(0, 0, { [TIER_I]: 11699, [TIER_II]: 9599 }),
      row(1, 2, { [TIER_I]: 14099, [TIER_II]: 12499 }),
    ];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules: [] });
    expect(diff.valid).toBe(true);
    expect(diff.summary).toEqual({ create: 4, update: 0, unchanged: 0, empty: 0 });
    expect(diff.plannedOps).toHaveLength(4);
    const first = diff.plannedOps[0];
    expect(first.action).toBe("CREATE");
    expect(first.data).toMatchObject({ tierId: TIER_I, zoneId: null, minDesi: 0, maxDesi: 0, chargeType: "FLAT", amountMinor: 11699 });
  });

  it("eşleşen kuralı idempotent biçimde UNCHANGED bırakır, farklıyı UPDATE eder", () => {
    const rows = [row(0, 0, { [TIER_I]: 11699, [TIER_II]: 8000 })];
    const existingRules = [
      existing({ id: "r1", tierId: TIER_I, minDesi: 0, maxDesi: 0, chargeType: "FLAT", amountMinor: 11699 }),
      existing({ id: "r2", tierId: TIER_II, minDesi: 0, maxDesi: 0, chargeType: "FLAT", amountMinor: 9599 }),
    ];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules });
    expect(diff.summary).toEqual({ create: 0, update: 1, unchanged: 1, empty: 0 });
    expect(diff.plannedOps).toEqual([{ action: "UPDATE", ruleId: "r2", data: expect.objectContaining({ amountMinor: 8000 }) }]);
  });

  it("boş hücre kural oluşturmaz ve mevcudu silmez", () => {
    const rows = [row(0, 0, { [TIER_I]: null, [TIER_II]: 9599 })];
    const existingRules = [existing({ id: "r1", tierId: TIER_I, minDesi: 0, maxDesi: 0, chargeType: "FLAT", amountMinor: 11699 })];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules });
    expect(diff.summary).toEqual({ create: 1, update: 0, unchanged: 0, empty: 1 });
    // r1'e dokunulmaz (boş hücre); yalnız TIER_II CREATE.
    expect(diff.plannedOps).toEqual([{ action: "CREATE", data: expect.objectContaining({ tierId: TIER_II }) }]);
  });

  it("30+ satırını (max=null) eşik üstü birim ücrete (PER_ADDITIONAL) çevirir", () => {
    const rows = [row(30, null, { [TIER_I]: 1250 }, "PER_ADDITIONAL")];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules: [] });
    expect(diff.plannedOps[0].data).toMatchObject({
      chargeType: "PER_ADDITIONAL_KG_OR_DESI",
      maxDesi: null,
      unitAmountMinor: 1250,
      baseAmountMinor: 0,
      baseThreshold: 30,
    });
  });

  it("30+ satırını sabit toplam ücrette (FIXED) FLAT + maxDesi=null yapar", () => {
    const rows = [row(30, null, { [TIER_I]: 50000 }, "FIXED")];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules: [] });
    expect(diff.plannedOps[0].data).toMatchObject({ chargeType: "FLAT", maxDesi: null, amountMinor: 50000 });
  });

  it("negatif fiyatı reddeder (valid=false)", () => {
    const rows = [row(0, 0, { [TIER_I]: -100 })];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules: [] });
    expect(diff.valid).toBe(false);
    expect(diff.errors[0].code).toBe("NEGATIVE_PRICE");
  });

  it("geçersiz aralık (min>max) ve çakışmayı yakalar", () => {
    const invalid = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows: [row(5, 2, { [TIER_I]: 100 })], existingRules: [] });
    expect(invalid.errors.some((e) => e.code === "INVALID_RANGE")).toBe(true);
    const overlap = buildMatrixDiff({
      mode: "SEGMENT",
      axis: "DESI",
      rows: [row(0, 5, { [TIER_I]: 100 }), row(3, 8, { [TIER_I]: 200 })],
      existingRules: [],
    });
    expect(overlap.errors.some((e) => e.code === "RANGE_OVERLAP")).toBe(true);
  });

  it("matris kapsamı dışındaki özel kurala (cityCode dolu) dokunmaz", () => {
    const rows = [row(0, 0, { [TIER_I]: 11699 })];
    const existingRules = [
      existing({ id: "special", tierId: TIER_I, minDesi: 0, maxDesi: 0, cityCode: "34", chargeType: "FLAT", amountMinor: 5000 }),
    ];
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows, existingRules });
    // Özel kural eşleşmez => yeni CREATE, special'a dokunulmaz.
    expect(diff.summary).toMatchObject({ create: 1 });
    expect(diff.plannedOps.every((op) => !("ruleId" in op && op.ruleId === "special"))).toBe(true);
  });
});

describe("parseCsvToMatrix", () => {
  // Üretimdeki buildCsvColumns gibi normalizeKey kullan (TR locale: "I" -> "ı").
  const columns: CsvColumn[] = [
    { key: normalizeKey("Tarife I"), columnId: TIER_I },
    { key: normalizeKey("Tarife II"), columnId: TIER_II },
  ];

  it("noktalı virgül ayraçlı TR ondalıklı CSV'yi parse eder", () => {
    const csv = "desi_min;desi_max;Tarife I;Tarife II\n0;0;116,99;95,99\n1;2;140,99;124,99";
    const parsed = parseCsvToMatrix(csv, columns);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ min: 0, max: 0 });
    expect(parsed.rows[0].cells).toEqual([
      { columnId: TIER_I, amountMinor: 11699 },
      { columnId: TIER_II, amountMinor: 9599 },
    ]);
  });

  it("max boş => 've üzeri' (null) satırı", () => {
    const csv = "desi_min,desi_max,Tarife I\n30,,12.50";
    const parsed = parseCsvToMatrix(csv, [{ key: normalizeKey("Tarife I"), columnId: TIER_I }]);
    expect(parsed.rows[0]).toMatchObject({ min: 30, max: null });
    expect(parsed.rows[0].cells[0].amountMinor).toBe(1250);
  });

  it("bilinmeyen kolon ve geçersiz fiyatı raporlar", () => {
    const unknown = parseCsvToMatrix("desi_min;desi_max;Bilinmeyen\n0;0;10", columns);
    expect(unknown.errors.some((e) => e.code === "CSV_COLUMN_UNKNOWN")).toBe(true);
    const badPrice = parseCsvToMatrix("desi_min;desi_max;Tarife I\n0;0;abc", [{ key: normalizeKey("Tarife I"), columnId: TIER_I }]);
    expect(badPrice.errors.some((e) => e.code === "CSV_PRICE_INVALID")).toBe(true);
  });

  it("CSV -> matris -> diff uçtan uca CREATE üretir", () => {
    const csv = "desi_min;desi_max;Tarife I;Tarife II\n0;0;116,99;95,99";
    const parsed = parseCsvToMatrix(csv, columns);
    const diff = buildMatrixDiff({ mode: "SEGMENT", axis: "DESI", rows: parsed.rows, existingRules: [] });
    expect(diff.valid).toBe(true);
    expect(diff.summary.create).toBe(2);
  });
});

describe("buildMatrixDiff — ZONE (Aras desi/kg × zone)", () => {
  const ZONE_NEAR = "zone_near";
  it("WEIGHT ekseninde zone kuralı oluşturur", () => {
    const rows = [row(0, 1, { [ZONE_NEAR]: 5500 })];
    const diff = buildMatrixDiff({ mode: "ZONE", axis: "WEIGHT", rows, existingRules: [] });
    expect(diff.plannedOps[0].data).toMatchObject({ zoneId: ZONE_NEAR, tierId: null, minWeightKg: 0, maxWeightKg: 1, minDesi: null });
  });
});
