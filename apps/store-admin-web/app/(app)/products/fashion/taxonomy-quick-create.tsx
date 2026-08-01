"use client";

// TODO-165A (ADR-165A) Task 22/23 — Ürün formu içi, satır-içi taksonomi değeri hızlı-
// oluşturma. `product-dictionaries/taxonomy-editor.tsx` (Task 24) ile AYNI deseni
// (yalnız AD alınır, slug SUNUCUDA türetilir, 409 TAXONOMY_DUPLICATE `taxonomyErrorMessage`
// ile Türkçe'ye çevrilir) izler; farkı yalnız CREATE-only olması ve oluşturulan
// `ProductTaxonomyValue`'yu (mesaj değil) `onCreated` ile geri vermesidir — çağıran
// (TaxonomySelectField) bu değerin `attributeOptionId`'sini form state'ine YAZAR ve
// seçenek listesine REMOUNT OLMADAN enjekte eder.

import { useMemo, useState, type FormEvent } from "react";
import { slugify } from "@commerce-os/utils";
import type { Locale } from "@commerce-os/i18n";
import type { ProductTaxonomyValue } from "@commerce-os/api-client";
import type { ProductTaxonomyType } from "@commerce-os/contracts/product-taxonomy";
import { Alert, Button, Input, Modal } from "../../../../components/ui";
import { storeApi } from "../../../../lib/client/api";
import { taxonomyErrorMessage } from "../../product-dictionaries/taxonomy-errors";

export interface TaxonomyQuickCreateLabels {
  title: string;
  description: (typeLabel: string) => string;
  nameLabel: string;
  namePlaceholder: string;
  slugPreview: (slug: string) => string;
  slugHint: string;
  nameRequired: string;
  cancel: string;
  create: string;
  creating: string;
}

export interface TaxonomyQuickCreateProps {
  type: ProductTaxonomyType;
  typeLabel: string;
  locale: Locale;
  labels: TaxonomyQuickCreateLabels;
  onClose: () => void;
  onCreated: (value: ProductTaxonomyValue) => void;
}

export function TaxonomyQuickCreate({
  type,
  typeLabel,
  locale,
  labels,
  onClose,
  onCreated,
}: TaxonomyQuickCreateProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const slugPreview = useMemo(() => (name.trim() ? slugify(name) : ""), [name]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(labels.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const response = await storeApi.createProductTaxonomyValue({ type, name: trimmed });
      onCreated(response.data);
    } catch (caught) {
      setError(taxonomyErrorMessage(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={labels.title}
      description={labels.description(typeLabel)}
      closeLabel={labels.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button type="submit" form="taxonomy-quick-create-form" disabled={saving}>
            {saving ? labels.creating : labels.create}
          </Button>
        </>
      }
    >
      <form id="taxonomy-quick-create-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Input
            id="taxonomy-quick-create-name"
            label={labels.nameLabel}
            placeholder={labels.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            required
            autoFocus
          />
          <p className="mt-1.5 text-xs text-white/30">
            {slugPreview ? labels.slugPreview(slugPreview) : labels.slugHint}
          </p>
        </div>
      </form>
    </Modal>
  );
}
