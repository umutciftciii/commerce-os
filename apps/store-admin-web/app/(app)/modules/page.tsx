"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../components/ui";
import { SettingsIcon } from "../../../components/icons";
import {
  storeApi,
  type StoreModuleClientState,
  type StoreModuleMatrixEntry,
} from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; modules: StoreModuleMatrixEntry[] };

const GROUP_LABELS: Record<string, { tr: string; en: string }> = {
  catalog: { tr: "Katalog", en: "Catalogue" },
  sales: { tr: "Satış", en: "Sales" },
  sponsorship: { tr: "Sponsorluk", en: "Sponsorship" },
  appearance: { tr: "Görünüm & Ayar", en: "Appearance & Settings" },
  system: { tr: "Sistem", en: "System" },
};

const SOURCE_LABELS: Record<StoreModuleMatrixEntry["source"], { tr: string; en: string }> = {
  core: { tr: "Çekirdek", en: "Core" },
  override: { tr: "Mağaza ayarı", en: "Store override" },
  plan: { tr: "Plan", en: "Plan" },
  baseline: { tr: "Varsayılan", en: "Default" },
  dependency: { tr: "Bağımlılık", en: "Dependency" },
};

/**
 * TODO-163 (ADR-208…ADR-210) — Mağaza modül/capability yönetimi. Effective durum + source
 * SUNUCUDA türetilir (istemci yalnız override state gönderir). core modüller kapatılamaz
 * (Select devre dışı). Değişiklik anında PUT ile kalıcı; yanıt otoritatif matrisi döner.
 */
export default function StoreModulesPage() {
  const locale = useLocale();
  const g = (key: string) =>
    locale === "tr" ? GROUP_LABELS[key]?.tr ?? key : GROUP_LABELS[key]?.en ?? key;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await storeApi.listModules();
      setState({ status: "ready", modules: res.data.modules });
    } catch (err) {
      setState({ status: "error", message: messageForError(err, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = useCallback(
    async (moduleKey: string, next: StoreModuleClientState) => {
      setSavingKey(moduleKey);
      setNotice(null);
      setError(null);
      try {
        const res = await storeApi.setModuleOverride(moduleKey, next);
        setState({ status: "ready", modules: res.data.modules });
        setNotice(locale === "tr" ? "Modül güncellendi." : "Module updated.");
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setSavingKey(null);
      }
    },
    [locale],
  );

  const grouped = useMemo(() => {
    if (state.status !== "ready") return [];
    const order: string[] = [];
    const map = new Map<string, StoreModuleMatrixEntry[]>();
    for (const m of state.modules) {
      if (!map.has(m.group)) {
        map.set(m.group, []);
        order.push(m.group);
      }
      map.get(m.group)!.push(m);
    }
    return order.map((group) => ({ group, items: map.get(group)! }));
  }, [state]);

  const stateOptions = useMemo(
    () =>
      locale === "tr"
        ? [
            { value: "INHERIT", label: "Varsayılan (devral)" },
            { value: "ENABLED", label: "Açık" },
            { value: "DISABLED", label: "Kapalı" },
          ]
        : [
            { value: "INHERIT", label: "Inherit (default)" },
            { value: "ENABLED", label: "Enabled" },
            { value: "DISABLED", label: "Disabled" },
          ],
    [locale],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="TODO-163"
        title={locale === "tr" ? "Modüller & Yetkiler" : "Modules & Capabilities"}
        description={
          locale === "tr"
            ? "Bu mağaza için modülleri açıp kapatın. Etkin durum sunucuda plan ve mağaza ayarından türetilir; çekirdek modüller kapatılamaz."
            : "Enable or disable modules for this store. Effective state is derived on the server from plan and store overrides; core modules cannot be disabled."
        }
      />

      {notice ? <Alert tone="success" title={notice} /> : null}
      {error ? <Alert tone="error" title={error} /> : null}

      {state.status === "loading" ? (
        <SectionCard title={locale === "tr" ? "Yükleniyor" : "Loading"} icon={<SettingsIcon />}>
          <SkeletonRows rows={6} />
        </SectionCard>
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          title={state.message}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {locale === "tr" ? "Tekrar dene" : "Retry"}
            </Button>
          }
        />
      ) : null}

      {state.status === "ready"
        ? grouped.map(({ group, items }) => (
            <SectionCard key={group} title={g(group)} icon={<SettingsIcon />}>
              <ul className="divide-y divide-white/[0.06]">
                {items.map((m) => {
                  const label = locale === "tr" ? m.labelTr : m.labelEn;
                  const source = locale === "tr" ? SOURCE_LABELS[m.source].tr : SOURCE_LABELS[m.source].en;
                  return (
                    <li key={m.key} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/85">{label}</span>
                          {m.core ? (
                            <Badge tone="brand">{locale === "tr" ? "Çekirdek" : "Core"}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-white/35">{m.descriptionTr}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={m.effectiveEnabled ? "success" : "neutral"} dot>
                          {m.effectiveEnabled
                            ? locale === "tr"
                              ? "Açık"
                              : "On"
                            : locale === "tr"
                              ? "Kapalı"
                              : "Off"}
                          <span className="ml-1 opacity-60">· {source}</span>
                        </Badge>
                        <Select
                          aria-label={label}
                          options={stateOptions}
                          value={m.overrideState}
                          disabled={m.core || savingKey === m.key}
                          onChange={(e) => void onChange(m.key, e.target.value as StoreModuleClientState)}
                          className="w-44"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ))
        : null}
    </div>
  );
}
