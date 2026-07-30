"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Select, useLocale } from "@commerce-os/ui";
import type { ThemeBindingResponse } from "@commerce-os/api-client";
import { adminApi } from "../lib/client/api";
import { messageForError } from "../lib/client/messages";

/**
 * TODO-164 (ADR-222) — Platform Admin "Tema ve Marka" paneli. Bir mağazanın aktif
 * temasını (theme-key, layout preset, API uyumu, published/draft revision, son
 * publish, rollback uygunluğu, capability durumu, uyumsuz uyarısı) SALT-OKUR gösterir
 * ve platform admin'in theme-key ATAMASINA izin verir. İç token belgesi / draft config
 * GÖSTERİLMEZ (yalnız yönetim özeti; sunucu-otoriter).
 */

const TR = {
  title: "Tema ve Marka",
  loading: "Yükleniyor…",
  active: "Aktif tema",
  layout: "Düzen preset",
  apiVersion: "Tema API",
  published: "Yayın revizyonu",
  draft: "Taslak revizyonu",
  previous: "Önceki yayın",
  lastPublish: "Son yayın",
  rollback: "Geri alma",
  rollbackYes: "mevcut",
  rollbackNo: "yok",
  capability: "Theme Studio",
  capabilityOn: "açık",
  capabilityOff: "kapalı",
  compatible: "Uyumlu",
  incompatible: "Uyumsuz",
  assign: "Tema ata",
  assignBtn: "Ata",
  assigned: "Tema atandı.",
  none: "—",
} as const;

function kindLabel(kind: string): string {
  if (kind === "CUSTOM_PACKAGE") return "Özel Paket";
  if (kind === "LAYOUT_PRESET") return "Layout Preset";
  return "Temel";
}

export function ThemeBindingPanel({ storeId }: { storeId: string }) {
  const locale = useLocale();
  const [binding, setBinding] = useState<ThemeBindingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .getThemeBinding(storeId)
      .then((b) => {
        if (!active) return;
        setBinding(b);
        setSelected(b.activeThemeKey);
      })
      .catch((e) => active && setError(messageForError(e, locale)));
    return () => {
      active = false;
    };
  }, [storeId, locale]);

  async function onAssign() {
    if (!selected || selected === binding?.activeThemeKey) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const updated = await adminApi.assignThemeBinding(storeId, { themeKey: selected });
      setBinding(updated);
      setSelected(updated.activeThemeKey);
      setToast(TR.assigned);
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  if (error && !binding) return <Alert tone="error">{error}</Alert>;
  if (!binding) return <p className="text-sm text-slate-400">{TR.loading}</p>;

  const assignOptions = binding.assignableThemes.map((t) => ({
    value: t.key,
    label: `${t.nameTr} · ${kindLabel(t.kind)}${t.compatible ? "" : " (uyumsuz)"}`,
    disabled: !t.compatible,
  }));

  return (
    <div className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">{TR.title}</h3>
        {binding.compatible ? (
          <Badge tone="success">{TR.compatible}</Badge>
        ) : (
          <Badge tone="danger">{TR.incompatible}</Badge>
        )}
      </div>

      {!binding.compatible && binding.issues.length > 0 ? (
        <Alert tone="warning">
          {binding.issues.map((i) => i.message).join(" · ")}
        </Alert>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label={TR.active} value={`${binding.activeThemeName} · ${kindLabel(binding.kind)}`} />
        <Row label={TR.layout} value={binding.layoutPreset} />
        <Row label={TR.apiVersion} value={`v${binding.themeApiVersion}`} />
        <Row label={TR.capability} value={binding.capabilityEnabled ? TR.capabilityOn : TR.capabilityOff} />
        <Row label={TR.published} value={binding.publishedVersion ? `v${binding.publishedVersion}` : TR.none} />
        <Row label={TR.draft} value={binding.draftVersion ? `v${binding.draftVersion}` : TR.none} />
        <Row label={TR.previous} value={binding.previousPublishedVersion ? `v${binding.previousPublishedVersion}` : TR.none} />
        <Row label={TR.rollback} value={binding.rollbackAvailable ? TR.rollbackYes : TR.rollbackNo} />
        <Row label={TR.lastPublish} value={binding.lastPublishedAt ? new Date(binding.lastPublishedAt).toLocaleString(locale) : TR.none} />
      </dl>

      <div className="flex items-end gap-2 border-t border-slate-700/50 pt-3">
        <div className="flex-1">
          <Select
            id="theme-assign"
            label={TR.assign}
            options={assignOptions}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onAssign}
          disabled={busy || selected === binding.activeThemeKey}
        >
          {TR.assignBtn}
        </Button>
      </div>
      {toast ? <Alert tone="success">{toast}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
  );
}
