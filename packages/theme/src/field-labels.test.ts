import { describe, it, expect } from "vitest";
import { FIELD_LABELS, getFieldLabel, listFieldLabels } from "./field-labels.js";
import { CANONICAL_FIELD_PATHS } from "./override-policy.js";

describe("field-labels", () => {
  it("her canonical alanın kullanıcı-dostu etiketi var", () => {
    for (const path of CANONICAL_FIELD_PATHS) {
      const label = getFieldLabel(path);
      expect(label).toBeDefined();
      expect(label.labelTr.length).toBeGreaterThan(0);
      expect(label.labelEn.length).toBeGreaterThan(0);
      expect(label.descriptionTr.length).toBeGreaterThan(0);
      expect(label.usageTr.length).toBeGreaterThan(0);
    }
  });

  it("teknik token isimleri (primary/surface/muted) kullanıcı etiketinde GEÇMEZ", () => {
    for (const label of listFieldLabels()) {
      const lower = label.labelTr.toLowerCase();
      expect(lower).not.toMatch(/\b(primary|surface|muted|token|slot)\b/);
    }
  });

  it("ana buton rengi doğru kullanıcı dili", () => {
    expect(FIELD_LABELS["brand.primaryColor"].labelTr).toBe("Ana buton rengi");
    expect(FIELD_LABELS["brand.primaryColor"].usageTr).toContain("Sepete ekle");
  });

  it("previewTarget her alan için tanımlı ve tipli", () => {
    for (const label of listFieldLabels()) {
      expect(["css-var", "slot", "asset"]).toContain(label.previewTarget.kind);
      expect(label.previewTarget.value.length).toBeGreaterThan(0);
    }
  });

  it("listFieldLabels tüm alanları kapsar", () => {
    expect(listFieldLabels().length).toBe(CANONICAL_FIELD_PATHS.length);
  });
});
