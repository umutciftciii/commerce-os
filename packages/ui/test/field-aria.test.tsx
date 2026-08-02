import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fieldAria } from "../src/field-aria";
import { Input } from "../src/input";
import { Select } from "../src/select";

describe("fieldAria (pure)", () => {
  it("wires aria-invalid + describedby to the error id when an error is present", () => {
    const r = fieldAria("email", { error: "Geçersiz e-posta" });
    expect(r.control["aria-invalid"]).toBe(true);
    expect(r.control["aria-describedby"]).toBe("email-error");
    expect(r.errorId).toBe("email-error");
  });

  it("wires describedby to the hint id when there is a hint and no error", () => {
    const r = fieldAria("pass", { hint: "En az 8 karakter" });
    expect(r.control["aria-invalid"]).toBeUndefined();
    expect(r.control["aria-describedby"]).toBe("pass-hint");
  });

  it("prefers the error over the hint (error wins)", () => {
    const r = fieldAria("x", { error: "Zorunlu", hint: "İpucu" });
    expect(r.control["aria-describedby"]).toBe("x-error");
    expect(r.hintId).toBeUndefined();
  });

  it("marks aria-required when required", () => {
    const r = fieldAria("x", { required: true });
    expect(r.control["aria-required"]).toBe(true);
  });
});

describe("Input · error accessibility (C1)", () => {
  it("renders aria-invalid, aria-describedby and an id-linked error message", () => {
    const html = renderToStaticMarkup(
      <Input id="email" label="E-posta" error="Geçersiz e-posta" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
    expect(html).toContain('id="email-error"');
    expect(html).toContain("Geçersiz e-posta");
  });
});

describe("Select · error accessibility (C1)", () => {
  it("associates the error message with the select via describedby", () => {
    const html = renderToStaticMarkup(
      <Select
        id="country"
        label="Ülke"
        options={[{ value: "tr", label: "Türkiye" }]}
        error="Bir ülke seçin"
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="country-error"');
    expect(html).toContain('id="country-error"');
  });
});
