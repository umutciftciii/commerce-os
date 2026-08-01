"use client";

/**
 * TODO-165A (ADR-165A) Task 17 — Ürün formu marka atama alanı.
 *
 * Serbest-metin `brand` girişinin yerini governed marka SEÇİMİ aldı: paylaşılan
 * `EntitySelectorField` TEK-seçim modunda (ADR-090 deseni; `product-category-field.tsx`
 * ile aynı — ikinci bir arama çözümü YAZILMAZ) + satır-içi "Yeni marka oluştur"
 * hızlı-oluşturma (`brand-editor.tsx`'i mount eder, kendi CRUD akışını AYNEN kullanır).
 *
 * Quick-create SONRASI yeni marka otomatik seçilir (RHF `brandId` set edilir);
 * bu bileşen kendi local `createOpen` state'ini taşır — üst ürün formu (ve onun
 * diğer RHF alan değerleri) REMOUNT OLMAZ, yalnız bu alanın değeri değişir.
 */

import { useState } from "react";
import { getDictionary, type Locale } from "@commerce-os/i18n";
import { Button } from "../../../components/ui";
import { EntitySelectorField, useBrandSelectorBinding } from "../../../components/selector";
import { messageForError } from "../../../lib/client/messages";
import { BrandEditor } from "../brands/brand-editor";

export interface ProductBrandFieldProps {
  locale: Locale;
  /** Governed marka FK; null = markasız (opsiyonel alan, fallback serbest-metin YOK). */
  value: string | null;
  onChange: (brandId: string | null) => void;
  disabled?: boolean;
}

export function ProductBrandField({ locale, value, onChange, disabled }: ProductBrandFieldProps) {
  const dict = getDictionary(locale).storeAdmin;
  const f = dict.products.form;
  const binding = useBrandSelectorBinding(locale);
  // Quick-create modalı kendi local state'i — açılıp kapanması ürün formunun RHF
  // state'ini ETKİLEMEZ (form REMOUNT OLMAZ).
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div>
      <EntitySelectorField
        label={f.brandLabel}
        hint={f.brandHint}
        multiple={false}
        value={value ? [value] : []}
        onChange={(ids) => onChange(ids[0] ?? null)}
        source={binding.source}
        presenter={binding.presenter}
        labels={binding.labels}
        toMessage={(cause) => messageForError(cause, locale)}
        modalTitle={binding.title}
        modalDescription={binding.description}
        disabled={disabled}
      />

      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setCreateOpen(true)}
        >
          {f.brandCreateAction}
        </Button>
      </div>

      {createOpen ? (
        <BrandEditor
          editor={{ mode: "create" }}
          onClose={() => setCreateOpen(false)}
          onSaved={(_message, brand) => {
            // Yeni marka otomatik SEÇİLİR (RHF `brandId` güncellenir); form state'inin
            // GERİ KALANI (başlık, kategori, varyant seçimleri…) DOKUNULMADAN kalır.
            setCreateOpen(false);
            if (brand) onChange(brand.id);
          }}
        />
      ) : null}
    </div>
  );
}
