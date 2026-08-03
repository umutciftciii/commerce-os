/**
 * ADR-268 §11 — CSV üretimi testleri: formül-injection koruması + BOM + kaçışlama.
 */
import { describe, expect, it } from "vitest";
import { buildCsv, csvCell, UTF8_BOM } from "../src/finance/csv.js";

describe("csvCell — injection guard + kaçışlama", () => {
  it("formül öneki (=,+,-,@) tek-tırnakla nötrlenir", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("virgül/tırnak/newline içeren değer çift-tırnakla sarılır ve tırnak ikilenr", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("sayı ve null güvenli", () => {
    expect(csvCell(1234)).toBe("1234");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("buildCsv", () => {
  it("BOM önekli, \\r\\n satır sonlu, başlık + satırlar", () => {
    const csv = buildCsv(["a", "b"], [[1, "x"], [2, "y,z"]]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    const body = csv.slice(UTF8_BOM.length);
    expect(body).toBe('a,b\r\n1,x\r\n2,"y,z"');
  });
});
