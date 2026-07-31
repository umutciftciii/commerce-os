import { describe, it, expect } from "vitest";
import {
  computeUpdateAvailable,
  isArchivedTemplateStatus,
  isAssignableTemplateStatus,
  summarizeRollout,
  THEME_LIBRARY_STORE_PURPOSE,
  type RolloutStoreResult,
} from "./library.js";

describe("library — update-available", () => {
  it("template published > store source → true", () => {
    expect(computeUpdateAvailable(1, 2)).toBe(true);
  });
  it("eşit sürüm → false", () => {
    expect(computeUpdateAvailable(2, 2)).toBe(false);
  });
  it("bağımsız tema (source null) → false", () => {
    expect(computeUpdateAvailable(null, 5)).toBe(false);
  });
  it("template published yok → false", () => {
    expect(computeUpdateAvailable(1, null)).toBe(false);
  });
});

describe("library — atanabilirlik", () => {
  it("yalnız PUBLISHED atanabilir", () => {
    expect(isAssignableTemplateStatus("PUBLISHED")).toBe(true);
    expect(isAssignableTemplateStatus("DRAFT")).toBe(false);
    expect(isAssignableTemplateStatus("ARCHIVED")).toBe(false);
    expect(isAssignableTemplateStatus("INCOMPATIBLE")).toBe(false);
  });
  it("ARCHIVED işaretlenir (rollback için kalabilir)", () => {
    expect(isArchivedTemplateStatus("ARCHIVED")).toBe(true);
    expect(isArchivedTemplateStatus("PUBLISHED")).toBe(false);
  });
  it("sistem mağazası işareti sabit", () => {
    expect(THEME_LIBRARY_STORE_PURPOSE).toBe("THEME_LIBRARY");
  });
});

describe("library — rollout özeti", () => {
  it("başarılı/başarısız/atlanan ayrı sayılır; failed gizlenmez", () => {
    const results: RolloutStoreResult[] = [
      { storeId: "a", status: "success", newVersion: 3 },
      { storeId: "b", status: "failed", reasonCode: "THEME_INCOMPATIBLE" },
      { storeId: "c", status: "skipped", reasonCode: "NO_CHANGE" },
      { storeId: "d", status: "success", newVersion: 4 },
    ];
    const s = summarizeRollout("selected", results);
    expect(s.total).toBe(4);
    expect(s.succeeded).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.mode).toBe("selected");
  });
  it("boş rollout → hepsi sıfır", () => {
    const s = summarizeRollout("single", []);
    expect(s.total).toBe(0);
    expect(s.succeeded + s.failed + s.skipped).toBe(0);
  });
});
