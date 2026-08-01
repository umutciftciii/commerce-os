"use client";

// TODO-165A (ADR-165A) Task 24 — "Ürün Sözlükleri" ekranı: governed Product Taxonomy
// (Sezon/Koleksiyon/Materyal/Kalıp/Desen/Yaka/Kol/Boy/Bakım/Sürdürülebilirlik/Renk Ailesi)
// tip-başına sekmeli CRUD. FASHION_VERTICAL modülüne bağlı (layout `ModuleGuard`).
//
// Sekme etiketleri DAİMA `TAXONOMY_TYPE_REGISTRY[type].labelTr` (insan-okur) — asla
// `fashion.*` definitionCode ya da teknik `option.value` gösterilmez. Sekme listesi
// `PRODUCT_TAXONOMY_TYPES` (registry sıralı liste) — kod SABİT bir dizi TUTMAZ; registry
// büyürse (yeni tip eklenirse) sekme otomatik belirir.

import { useState } from "react";
import { PageHeader, useLocale } from "../../../components/ui";
import { PRODUCT_TAXONOMY_TYPES, TAXONOMY_TYPE_REGISTRY } from "@commerce-os/contracts/product-taxonomy";
import { DictionaryTab } from "./dictionary-tab";

export default function ProductDictionariesPage() {
  const locale = useLocale();
  const [activeType, setActiveType] = useState(PRODUCT_TAXONOMY_TYPES[0]);

  const label = (type: (typeof PRODUCT_TAXONOMY_TYPES)[number]) =>
    locale === "tr" ? TAXONOMY_TYPE_REGISTRY[type].labelTr : TAXONOMY_TYPE_REGISTRY[type].labelEn;

  return (
    <>
      <PageHeader
        eyebrow="Moda"
        title="Ürün Sözlükleri"
        description="Ürünlerinizde kullanılan yönetişimli sözlükleri (sezon, materyal, kalıp, bakım vb.) düzenleyin. Değerler ürün/varyant özniteliklerine bağlanır."
      />

      <nav
        role="tablist"
        aria-label="Ürün sözlükleri"
        className="mb-5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {PRODUCT_TAXONOMY_TYPES.map((type) => {
          const active = type === activeType;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveType(type)}
              className={[
                "inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-indigo-400/60 bg-indigo-500/[0.22] text-white shadow-[0_0_0_1px_rgba(129,140,248,0.20)]"
                  : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/20 hover:bg-white/[0.06] hover:text-white/90",
              ].join(" ")}
            >
              {label(type)}
            </button>
          );
        })}
      </nav>

      <DictionaryTab key={activeType} type={activeType} typeLabel={label(activeType)} />
    </>
  );
}
