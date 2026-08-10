import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@commerce-os/i18n";
import type { SupportQuestionGraphDto, SupportTopicDto } from "@commerce-os/contracts";
import {
  ContextHeader,
  QuestionStep,
  ResultStep,
  TopicStep,
} from "../components/account/support/guided-wizard";

/**
 * TODO-177 (ADR-289) Faz D — Sihirbaz adımlarının ilk-render doğrulaması: her soru tipi
 * DOĞRU kontrolü render eder, bağlam order-line'dan gösterilir ve HİÇBİR ham enum / teknik
 * anahtar (SINGLE_SELECT, PRODUCT_NOT_WORKING, question.key…) müşteriye sızmaz (gate şartı).
 */

const t = getDictionary("tr").storefront.account.support;
const noop = () => {};

function q(overrides: Partial<SupportQuestionGraphDto["questions"][number]>): SupportQuestionGraphDto["questions"][number] {
  return {
    key: "q1",
    type: "SINGLE_SELECT",
    prompt: "Sorununuz nedir?",
    helpText: null,
    sortOrder: 0,
    required: true,
    isEntry: true,
    options: [],
    ...overrides,
  };
}

describe("ContextHeader", () => {
  it("ürün + varyant + sipariş no gösterir (bağlam order-line'dan)", () => {
    const html = renderToStaticMarkup(
      <ContextHeader
        context={{ orderNumber: "OS-1", orderLineId: "ol-1", productTitle: "Kablosuz Kulaklık", variantTitle: "Siyah" }}
        t={t}
      />,
    );
    expect(html).toContain("Kablosuz Kulaklık");
    expect(html).toContain("Siyah");
    expect(html).toContain("OS-1");
    expect(html).not.toContain("ol-1"); // orderLineId teknik kimliği gösterilmez
  });
});

describe("TopicStep — konu seçimi", () => {
  it("insan-okur konu etiketleri gösterir, ham enum sızmaz", () => {
    const topics: SupportTopicDto[] = ["PRODUCT_NOT_WORKING", "WARRANTY_SERVICE", "OTHER"];
    const html = renderToStaticMarkup(
      <TopicStep topics={topics} selected={null} onSelect={noop} onContinue={noop} resolving={false} error={null} t={t} />,
    );
    expect(html).toContain("Ürün çalışmıyor");
    expect(html).toContain("Garanti / servis");
    // Ham enum yalnız data-testid'de (Playwright hook'u; kullanıcıya görünmez) olabilir;
    // görünür metin/attribute'larda enum sızmamalı.
    const visible = html.replace(/data-testid="[^"]*"/g, "");
    expect(visible).not.toContain("PRODUCT_NOT_WORKING");
    expect(visible).not.toContain("WARRANTY_SERVICE");
  });
});

describe("QuestionStep — her soru tipi render", () => {
  const base = { draft: {}, setDraft: noop, onBack: noop, onNext: noop, validationError: null, stepNumber: 1, t };

  it("SINGLE_SELECT → radio seçenekleri", () => {
    const html = renderToStaticMarkup(
      <QuestionStep {...base} question={q({ type: "SINGLE_SELECT", options: [{ key: "a", label: "Açılmıyor", sortOrder: 0 }] })} />,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain("Açılmıyor");
    expect(html).not.toContain("SINGLE_SELECT");
  });

  it("MULTI_SELECT → checkbox seçenekleri", () => {
    const html = renderToStaticMarkup(
      <QuestionStep {...base} question={q({ type: "MULTI_SELECT", options: [{ key: "a", label: "Ekran", sortOrder: 0 }] })} />,
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Ekran");
  });

  it("BOOLEAN → Evet/Hayır", () => {
    const html = renderToStaticMarkup(<QuestionStep {...base} question={q({ type: "BOOLEAN", options: [] })} />);
    expect(html).toContain("Evet");
    expect(html).toContain("Hayır");
  });

  it("SHORT_TEXT → tek satır input", () => {
    const html = renderToStaticMarkup(<QuestionStep {...base} question={q({ type: "SHORT_TEXT", options: [] })} />);
    expect(html).toContain('type="text"');
  });

  it("LONG_TEXT → textarea", () => {
    const html = renderToStaticMarkup(<QuestionStep {...base} question={q({ type: "LONG_TEXT", options: [] })} />);
    expect(html).toContain("<textarea");
  });

  it("INFO → yalnız bilgi metni (giriş kontrolü yok)", () => {
    const html = renderToStaticMarkup(
      <QuestionStep {...base} question={q({ type: "INFO", prompt: "Cihazı fişe takın.", required: false, options: [] })} />,
    );
    expect(html).toContain("Cihazı fişe takın.");
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('type="checkbox"');
  });

  it("required validation mesajını gösterir", () => {
    const html = renderToStaticMarkup(<QuestionStep {...base} validationError={t.wizard.selectOne} question={q({})} />);
    expect(html).toContain(t.wizard.selectOne);
  });
});

describe("ResultStep — self-service", () => {
  it("çözüldü/çözülmedi aksiyonlarını gösterir", () => {
    const html = renderToStaticMarkup(
      <ResultStep
        question={q({ key: "r1", type: "SELF_SERVICE_RESULT", prompt: "Şunu deneyin", required: false, options: [] })}
        onSolved={noop}
        onUnsolved={noop}
        onBack={noop}
        t={t}
      />,
    );
    expect(html).toContain("Şunu deneyin");
    expect(html).toContain(t.result.solved);
    expect(html).toContain(t.result.unsolved);
    expect(html).not.toContain("SELF_SERVICE_RESULT");
  });
});
