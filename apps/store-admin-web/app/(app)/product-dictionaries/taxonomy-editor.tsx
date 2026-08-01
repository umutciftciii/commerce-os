"use client";

// TODO-165A (ADR-165A) Task 24 — "Ürün Sözlükleri" değer oluşturma/düzenleme modalı.
// `brands/brand-editor.tsx` deseninin mirror'ı: yalnız AD alınır, slug SUNUCUDA türetilir
// (taxonomy-service `slugify`) — burada yalnız CANLI ÖNİZLEME gösterilir, kullanıcı slug'ı
// elle giremez (IMMUTABLE: rename slug'ı DEĞİŞTİRMEZ). Duplicate (aynı mağaza+tip+slug)
// sunucuda 409 TAXONOMY_DUPLICATE — `taxonomyErrorMessage` bunu Türkçe mesaja çevirir.

import { useMemo, useState, type FormEvent } from "react";
import { slugify } from "@commerce-os/utils";
import type { ProductTaxonomyTypeContract, ProductTaxonomyValue } from "@commerce-os/api-client";
import { Alert, Button, Input, Modal, useLocale } from "../../../components/ui";
import { storeApi } from "../../../lib/client/api";
import { taxonomyErrorMessage } from "./taxonomy-errors";

export type TaxonomyEditorState =
  | { mode: "create"; type: ProductTaxonomyTypeContract }
  | { mode: "edit"; value: ProductTaxonomyValue }
  | null;

export function TaxonomyEditor({
  editor,
  typeLabel,
  onClose,
  onSaved,
}: {
  editor: Exclude<TaxonomyEditorState, null>;
  /** Sekmenin insan-okur etiketi (ör. "Materyal / Kompozisyon") — modal başlığında gösterilir. */
  typeLabel: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const locale = useLocale();
  const isEdit = editor.mode === "edit";

  const [name, setName] = useState(isEdit ? editor.value.name : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const slugPreview = useMemo(() => (name.trim() ? slugify(name) : ""), [name]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length === 0) {
      setError("Ad zorunludur.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await storeApi.updateProductTaxonomyValue(editor.value.id, { name: name.trim() });
        onSaved("Değer güncellendi.");
      } else {
        await storeApi.createProductTaxonomyValue({ type: editor.type, name: name.trim() });
        onSaved("Değer oluşturuldu.");
      }
    } catch (caught) {
      setError(taxonomyErrorMessage(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Değeri Düzenle" : "Yeni Değer"}
      description={isEdit ? `${typeLabel} sözlüğündeki değeri güncelleyin.` : `${typeLabel} sözlüğüne yeni bir değer ekleyin.`}
      closeLabel="İptal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="submit" form="taxonomy-value-form" disabled={saving}>
            {saving ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Oluştur"}
          </Button>
        </>
      }
    >
      <form id="taxonomy-value-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Input
            id="taxonomy-value-name"
            label="Ad"
            placeholder="Örn. Pamuk"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            required
          />
          <p className="mt-1.5 text-xs text-white/30">
            {isEdit ? (
              <>
                Kısa ad (slug): <span className="font-mono text-white/40">{editor.value.slug}</span> —
                değişmez.
              </>
            ) : slugPreview ? (
              <>
                Kısa ad (slug) otomatik oluşturulacak:{" "}
                <span className="font-mono text-white/40">{slugPreview}</span>
              </>
            ) : (
              "Kısa ad (slug) addan otomatik oluşturulur ve sonradan değiştirilemez."
            )}
          </p>
        </div>
      </form>
    </Modal>
  );
}
