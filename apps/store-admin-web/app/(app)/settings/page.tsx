"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, PageHeader, SectionCard, SkeletonRows, useLocale } from "../../../components/ui";
import { SettingsIcon } from "../../../components/icons";
import { getDictionary } from "@commerce-os/i18n";
import type { StoreSettings } from "@commerce-os/api-client";
import { MediaUpload, type MediaItem } from "../../../components/media-upload";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; settings: StoreSettings };

/** StoreSettings yanıtındaki tekil media alanını MediaUpload'ın value[] biçimine çevirir. */
function toItems(id: string | null, url: string | null): MediaItem[] {
  return id && url ? [{ id, url, altText: null }] : [];
}

/**
 * ADR-065 (Faz 2/Dilim 4) — Mağaza marka ayarları. Faz 1'de statik olan bu sayfa artık
 * tamamen canlı: GET /api/store/settings ile logo/favicon yüklenir, iki bağımsız
 * MediaUpload (context="BRANDING", mode="single") ile düzenlenir, PATCH ile upsert edilir.
 * Tek `BRANDING` context'i paylaşan iki slotun kütüphanelerinin karışmaması için ikisi de
 * `libraryEnabled={false}` (yalnız-yükleme). Mağaza adı salt-okunur echo'dur (R8);
 * düzenlenebilir mağaza adı + iletişim e-postası bu dilim kapsamı dışıdır.
 */
export default function StoreSettingsPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.settings;
  const c = dict.common;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [logo, setLogo] = useState<MediaItem[]>([]);
  const [favicon, setFavicon] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setNotice(null);
    try {
      const settings = await storeApi.getStoreSettings();
      setLogo(toItems(settings.logoMediaId, settings.logoUrl));
      setFavicon(toItems(settings.faviconMediaId, settings.faviconUrl));
      setState({ status: "ready", settings });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await storeApi.updateStoreSettings({
        logoMediaId: logo[0]?.id ?? null,
        faviconMediaId: favicon[0]?.id ?? null,
      });
      // Yanıttan (türetilmiş URL'lerle) yeniden senkronla; buton "Kaydediliyor…"da takılmasın.
      setLogo(toItems(updated.logoMediaId, updated.logoUrl));
      setFavicon(toItems(updated.faviconMediaId, updated.faviconUrl));
      setState({ status: "ready", settings: updated });
      setNotice(t.savedToast);
    } catch (error) {
      setNotice(null);
      setState({ status: "error", message: messageForError(error, locale) });
    } finally {
      // F4C dersi: başarıda da sıfırla, aksi halde buton kilitli kalır.
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <SectionCard
        title={t.brandCardTitle}
        description={t.brandCardDescription}
        icon={<SettingsIcon />}
        actions={
          <Button size="sm" onClick={() => void save()} disabled={saving || state.status !== "ready"}>
            {saving ? c.states.saving : c.actions.save}
          </Button>
        }
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" ? (
          <div className="space-y-6">
            {notice ? <Alert tone="success">{notice}</Alert> : null}

            {/* R8 — salt-okunur mağaza adı echo'su (düzenleme bu dilim dışı). */}
            <div>
              <span className="mb-1 block text-sm font-medium text-white/70">{t.storeName}</span>
              <p className="text-sm text-white/50">{state.settings.storeName}</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-white/70">{t.logoLabel}</span>
                <MediaUpload
                  context="BRANDING"
                  mode="single"
                  libraryEnabled={false}
                  value={logo}
                  onAttach={(asset) => setLogo([{ id: asset.id, url: asset.url, altText: asset.altText }])}
                  onRemove={() => setLogo([])}
                  disabled={saving}
                />
                <p className="mt-1.5 text-xs text-white/30">{t.logoHint}</p>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-white/70">{t.faviconLabel}</span>
                <MediaUpload
                  context="BRANDING"
                  mode="single"
                  libraryEnabled={false}
                  value={favicon}
                  onAttach={(asset) => setFavicon([{ id: asset.id, url: asset.url, altText: asset.altText }])}
                  onRemove={() => setFavicon([])}
                  disabled={saving}
                />
                <p className="mt-1.5 text-xs text-white/30">{t.faviconHint}</p>
              </div>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
