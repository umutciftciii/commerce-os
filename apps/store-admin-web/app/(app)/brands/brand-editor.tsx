"use client";

// TODO-165A (ADR-165A) Task 15/16 — Marka (Brand) oluşturma/düzenleme modalı. `attributes/
// page.tsx` (AttributeEditor) + `categories/page.tsx` (CategoryEditor, MediaUpload kablolaması)
// desenlerini mirror eder. Slug SUNUCUDA türetilir (brand-service `slugify`); burada yalnız
// canlı ÖNİZLEME gösterilir — kullanıcı manuel slug girmez (kategoriden farkı budur).

import { useState, useMemo, type FormEvent } from "react";
import { slugify } from "@commerce-os/utils";
import { Alert, Button, Input, Modal, Textarea, useLocale } from "../../../components/ui";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
import type { Brand, BrandCreateRequest, BrandUpdateRequest } from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

export type BrandEditorState = { mode: "create" } | { mode: "edit"; brand: Brand } | null;

export function BrandEditor({
  editor,
  onClose,
  onSaved,
}: {
  editor: Exclude<BrandEditorState, null>;
  onClose: () => void;
  // TODO-165A (ADR-165A) Task 17 — `brand` opsiyonel 2. argüman: ürün formunun quick-create
  // akışı (bkz. brand-field.tsx) yeni markayı RHF'e hemen ön-seçmek için ihtiyaç duyar.
  // Mevcut `/brands` sayfası bu argümanı YOK SAYAR — geriye dönük uyumlu.
  onSaved: (message: string, brand?: Brand) => void;
}) {
  const locale = useLocale();
  const isEdit = editor.mode === "edit";

  const [name, setName] = useState(isEdit ? editor.brand.name : "");
  const [description, setDescription] = useState(isEdit ? (editor.brand.description ?? "") : "");
  const [websiteUrl, setWebsiteUrl] = useState(isEdit ? (editor.brand.websiteUrl ?? "") : "");
  const [seoTitle, setSeoTitle] = useState(isEdit ? (editor.brand.seoTitle ?? "") : "");
  const [seoDescription, setSeoDescription] = useState(
    isEdit ? (editor.brand.seoDescription ?? "") : "",
  );
  const [logo, setLogo] = useState<MediaItem[]>(
    isEdit && editor.brand.logoMediaId && editor.brand.logoUrl
      ? [{ id: editor.brand.logoMediaId, url: editor.brand.logoUrl, altText: null }]
      : [],
  );
  const [cover, setCover] = useState<MediaItem[]>(
    isEdit && editor.brand.coverMediaId && editor.brand.coverUrl
      ? [{ id: editor.brand.coverMediaId, url: editor.brand.coverUrl, altText: null }]
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Yalnız CREATE'te anlamlı — sunucu adı `slugify`ile türetir (bkz. brand-service.ts);
  // bu istemci-tarafı önizleme, kullanıcı slug'ı ELLE GİREMEZ.
  const slugPreview = useMemo(() => (name.trim() ? slugify(name) : ""), [name]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO-165A (ADR-165A) Task 17 — KRİTİK: bu modal artık ürün formunun İÇİNDE de
    // (quick-create) mount edilebiliyor. `Modal` `createPortal(document.body)` kullanır;
    // DOM'da kardeş olsa da React'in SENTETİK olay sistemi "submit"i DOM ağacı değil
    // REACT AĞACI boyunca yükseltir — stopPropagation OLMADAN bu submit, sarmalayan
    // `<form id="product-form">`ın onSubmit'ini de TETİKLERDİ (spurious ikinci kayıt).
    event.stopPropagation();
    setError(null);
    if (name.trim().length === 0) {
      setError("Marka adı zorunludur.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const payload: BrandUpdateRequest = {
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          websiteUrl: websiteUrl.trim() === "" ? null : websiteUrl.trim(),
          seoTitle: seoTitle.trim() === "" ? null : seoTitle.trim(),
          seoDescription: seoDescription.trim() === "" ? null : seoDescription.trim(),
          logoMediaId: logo[0]?.id ?? null,
          coverMediaId: cover[0]?.id ?? null,
        };
        const updated = await storeApi.updateBrand(editor.brand.id, payload);
        onSaved("Marka güncellendi.", updated.data);
      } else {
        const payload: BrandCreateRequest = {
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          websiteUrl: websiteUrl.trim() === "" ? null : websiteUrl.trim(),
          seoTitle: seoTitle.trim() === "" ? null : seoTitle.trim(),
          seoDescription: seoDescription.trim() === "" ? null : seoDescription.trim(),
          logoMediaId: logo[0]?.id ?? null,
          coverMediaId: cover[0]?.id ?? null,
          status: "ACTIVE",
        };
        const created = await storeApi.createBrand(payload);
        onSaved("Marka oluşturuldu.", created.data);
      }
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Markayı Düzenle" : "Yeni Marka"}
      description={
        isEdit
          ? "Marka bilgilerini, logosunu ve kapak görselini güncelleyin."
          : "Ürünlere bağlanacak yeni bir marka oluşturun."
      }
      closeLabel="İptal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="submit" form="brand-form" disabled={saving}>
            {saving ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Oluştur"}
          </Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div>
          <Input
            id="brand-name"
            label="Marka Adı"
            placeholder="Örn. Nike"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            required
          />
          <p className="mt-1.5 text-xs text-white/30">
            {isEdit ? (
              <>Kısa ad (slug): <span className="font-mono text-white/40">{editor.brand.slug}</span></>
            ) : slugPreview ? (
              <>Kısa ad (slug) otomatik oluşturulacak: <span className="font-mono text-white/40">{slugPreview}</span></>
            ) : (
              "Kısa ad (slug) marka adından otomatik oluşturulur."
            )}
          </p>
        </div>
        <Textarea
          id="brand-description"
          label="Açıklama"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
          rows={3}
        />
        <Input
          id="brand-website"
          label="Web Sitesi (opsiyonel)"
          placeholder="https://..."
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          disabled={saving}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-white/70">Logo</span>
            <MediaUpload
              context="BRANDING"
              mode="single"
              value={logo}
              onAttach={(asset) => setLogo([{ id: asset.id, url: asset.url, altText: asset.altText }])}
              onRemove={() => setLogo([])}
              disabled={saving}
              libraryEnabled={false}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-white/70">Kapak Görseli</span>
            <MediaUpload
              context="BRANDING"
              mode="single"
              value={cover}
              onAttach={(asset) => setCover([{ id: asset.id, url: asset.url, altText: asset.altText }])}
              onRemove={() => setCover([])}
              disabled={saving}
              libraryEnabled={false}
            />
          </div>
        </div>
        <Input
          id="brand-seo-title"
          label="SEO Başlığı (opsiyonel)"
          value={seoTitle}
          onChange={(event) => setSeoTitle(event.target.value)}
          disabled={saving}
        />
        <Textarea
          id="brand-seo-description"
          label="SEO Açıklaması (opsiyonel)"
          value={seoDescription}
          onChange={(event) => setSeoDescription(event.target.value)}
          disabled={saving}
          rows={2}
        />
      </form>
    </Modal>
  );
}
