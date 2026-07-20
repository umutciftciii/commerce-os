"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateThemeStylesheet,
  validateThemeDocument,
  type ThemeDocument,
} from "@commerce-os/theme";
import type {
  ThemeSummary,
  ThemeDetail,
  ThemePresetSummary,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  SectionCard,
  Select,
  Spinner,
} from "../../../components/ui";

// ── Düzenlenebilir token alanları (mimari tümünü destekler; UI çekirdeği kapsar) ──
type Group = "brand" | "surface" | "text" | "border" | "feedback";
const COLOR_FIELDS: { group: Group; label: string; keys: [string, string][] }[] = [
  {
    group: "brand",
    label: "Marka",
    keys: [
      ["primary", "Birincil"],
      ["secondary", "İkincil"],
      ["accent", "Aksan"],
      ["tertiary", "Üçüncül"],
    ],
  },
  {
    group: "surface",
    label: "Yüzeyler",
    keys: [
      ["background", "Sayfa zemini"],
      ["surface", "Yüzey"],
      ["surfaceMuted", "Sessiz yüzey"],
      ["surfaceElevated", "Yükseltilmiş"],
    ],
  },
  {
    group: "text",
    label: "Metin",
    keys: [
      ["primary", "Birincil"],
      ["secondary", "İkincil"],
      ["muted", "Sönük"],
      ["inverse", "Ters"],
      ["link", "Bağlantı"],
    ],
  },
  {
    group: "border",
    label: "Çizgi",
    keys: [
      ["default", "Varsayılan"],
      ["subtle", "İnce"],
      ["strong", "Belirgin"],
      ["focus", "Odak"],
    ],
  },
  {
    group: "feedback",
    label: "Durum",
    keys: [
      ["success", "Başarılı"],
      ["warning", "Uyarı"],
      ["error", "Hata"],
      ["info", "Bilgi"],
    ],
  },
];

function statusTone(status: string): "success" | "neutral" | "warning" {
  if (status === "PUBLISHED") return "success";
  if (status === "ARCHIVED") return "neutral";
  return "warning";
}

export function ThemeStudio() {
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [presets, setPresets] = useState<ThemePresetSummary[]>([]);
  const [detail, setDetail] = useState<ThemeDetail | null>(null);
  const [doc, setDoc] = useState<ThemeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Yeni tema formu
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState("");

  async function refreshList() {
    const list = await storeApi.listThemes();
    setThemes(list.themes);
  }

  useEffect(() => {
    (async () => {
      try {
        const [list, pres] = await Promise.all([storeApi.listThemes(), storeApi.themePresets()]);
        setThemes(list.themes);
        setPresets(pres.presets);
      } catch {
        setError("Temalar yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function run(fn: () => Promise<void>, okMsg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  const openEditor = (themeId: string) =>
    run(async () => {
      const d = await storeApi.getTheme(themeId);
      setDetail(d);
      const source = d.draft?.document ?? d.published?.document;
      const valid = validateThemeDocument(source);
      setDoc(valid.ok ? valid.document : null);
    });

  const closeEditor = () => {
    setDetail(null);
    setDoc(null);
    setNotice(null);
    setError(null);
  };

  const createTheme = () =>
    run(async () => {
      if (!newName.trim()) throw new Error("Tema adı gerekli.");
      const d = await storeApi.createTheme({
        name: newName.trim(),
        ...(newPreset ? { presetId: newPreset } : {}),
      });
      setNewName("");
      setNewPreset("");
      await refreshList();
      setDetail(d);
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
    }, "Tema oluşturuldu.");

  const setColor = (group: Group, key: string, value: string) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, tokens: { ...prev.tokens, [group]: { ...prev.tokens[group], [key]: value } } };
    });
  };

  const setRadius = (key: string, value: string) =>
    setDoc((prev) =>
      prev ? { ...prev, tokens: { ...prev.tokens, radius: { ...prev.tokens.radius, [key]: value } } } : prev,
    );

  const setFont = (key: "headingFont" | "bodyFont", value: string) =>
    setDoc((prev) =>
      prev
        ? { ...prev, tokens: { ...prev.tokens, typography: { ...prev.tokens.typography, [key]: value } } }
        : prev,
    );

  const saveDraft = () =>
    run(async () => {
      if (!detail || !doc) return;
      const d = await storeApi.saveThemeDraft(detail.id, {
        document: doc as unknown as Record<string, unknown>,
      });
      setDetail(d);
      await refreshList();
    }, "Taslak kaydedildi.");

  const publish = () =>
    run(async () => {
      if (!detail) return;
      // Önce mevcut düzenlemeleri taslağa yaz, sonra yayınla.
      if (doc) {
        await storeApi.saveThemeDraft(detail.id, {
          document: doc as unknown as Record<string, unknown>,
        });
      }
      const d = await storeApi.publishTheme(detail.id, {});
      setDetail(d);
      await refreshList();
    }, "Tema yayınlandı — vitrinde yayında.");

  const rollback = (version: number) =>
    run(async () => {
      if (!detail) return;
      const d = await storeApi.rollbackTheme(detail.id, { version });
      setDetail(d);
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
      await refreshList();
    }, "Versiyon taslağa geri yüklendi.");

  const exportTheme = () =>
    run(async () => {
      if (!detail) return;
      const { json } = await storeApi.exportTheme(detail.id);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${detail.name || "theme"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const importTheme = (file: File) =>
    run(async () => {
      const text = await file.text();
      const data = JSON.parse(text);
      const d = await storeApi.importTheme({ data });
      await refreshList();
      setDetail(d);
      const valid = validateThemeDocument(d.draft?.document);
      setDoc(valid.ok ? valid.document : null);
    }, "Tema içe aktarıldı.");

  const removeTheme = (themeId: string) =>
    run(async () => {
      await storeApi.deleteTheme(themeId);
      await refreshList();
    }, "Tema silindi.");

  // Canlı önizleme CSS'i (istemci tarafında @commerce-os/theme ile üretilir).
  const previewCss = useMemo(() => {
    if (!doc) return "";
    try {
      return generateThemeStylesheet(doc, { selector: "#tp-scope" });
    } catch {
      return "";
    }
  }, [doc]);

  if (loading) {
    return (
      <SectionCard title="Temalar">
        <Spinner label="Yükleniyor…" />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error" title="Hata">{error}</Alert> : null}
      {notice ? <Alert tone="success" title="Tamam">{notice}</Alert> : null}

      {!detail ? (
        <>
          <SectionCard
            title="Yeni tema"
            description="Bir preset seçin (ya da boş bırakıp varsayılandan başlayın), ad verin."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Tema adı</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Örn. Bahar Koleksiyonu" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-white/50">Preset</label>
                <Select
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  options={[
                    { value: "", label: "Varsayılan" },
                    ...presets.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
              <Button onClick={createTheme} disabled={busy}>
                Oluştur
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.06]">
                İçe aktar
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importTheme(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Temalar" description="Yalnız bir tema yayında olabilir.">
            {themes.length === 0 ? (
              <p className="text-sm text-white/50">Henüz tema yok.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white/90">{t.name}</p>
                      <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-white/40">
                      Kaynak: {t.source ?? "—"} · v{t.publishedVersion ?? t.draftVersion ?? "—"} · {t.colorScheme}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => openEditor(t.id)} disabled={busy}>
                        Düzenle
                      </Button>
                      {t.status !== "PUBLISHED" ? (
                        <Button size="sm" variant="ghost" onClick={() => removeTheme(t.id)} disabled={busy}>
                          Sil
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <SectionCard
          title={`Düzenle: ${detail.name}`}
          description={`Durum: ${detail.status} · Taslak v${detail.draft?.version ?? "—"} · Yayın v${detail.published?.version ?? "—"}`}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={closeEditor}>
              ← Listeye dön
            </Button>
            <Button size="sm" onClick={saveDraft} disabled={busy || !doc}>
              Taslağı kaydet
            </Button>
            <Button size="sm" onClick={publish} disabled={busy}>
              Yayınla
            </Button>
            <Button variant="secondary" size="sm" onClick={exportTheme} disabled={busy}>
              Dışa aktar
            </Button>
          </div>

          {!doc ? (
            <Alert tone="warning" title="Belge çözümlenemedi">
              Bu tema versiyonu düzenlenemiyor.
            </Alert>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Editör */}
              <div className="space-y-5">
                {COLOR_FIELDS.map((section) => (
                  <div key={section.group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                      {section.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {section.keys.map(([key, label]) => {
                        const value = String(doc.tokens[section.group][key] ?? "");
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span
                              className="h-7 w-7 shrink-0 rounded border border-white/15"
                              style={{ background: value }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <label className="block truncate text-[11px] text-white/45">{label}</label>
                              <Input
                                value={value}
                                onChange={(e) => setColor(section.group, key, e.target.value)}
                                className="text-xs"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Köşe yarıçapı
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["sm", "md", "lg"] as const).map((k) => (
                      <div key={k}>
                        <label className="block text-[11px] text-white/45">{k}</label>
                        <Input
                          value={String(doc.tokens.radius[k] ?? "")}
                          onChange={(e) => setRadius(k, e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                    Tipografi
                  </p>
                  <label className="block text-[11px] text-white/45">Başlık ailesi</label>
                  <Input
                    value={doc.tokens.typography.headingFont}
                    onChange={(e) => setFont("headingFont", e.target.value)}
                    className="mb-2 text-xs"
                  />
                  <label className="block text-[11px] text-white/45">Gövde ailesi</label>
                  <Input
                    value={doc.tokens.typography.bodyFont}
                    onChange={(e) => setFont("bodyFont", e.target.value)}
                    className="text-xs"
                  />
                </div>

                {detail.versions.length > 1 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                      Versiyonlar (rollback)
                    </p>
                    <div className="space-y-1">
                      {detail.versions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-xs text-white/60">
                          <span>
                            v{v.version} · {v.status}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => rollback(v.version)} disabled={busy}>
                            Geri yükle
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Canlı önizleme (istemci-tarafı @commerce-os/theme ile) */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Canlı önizleme
                </p>
                <style dangerouslySetInnerHTML={{ __html: previewCss }} />
                <div
                  id="tp-scope"
                  className="overflow-hidden rounded-lg border border-white/10"
                  style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-sans)" }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}
                  >
                    <span style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}>Mağaza</span>
                    <span
                      style={{
                        background: "var(--accent)",
                        color: "var(--accent-contrast)",
                        borderRadius: "var(--radius-md)",
                        padding: "6px 12px",
                        fontSize: 12,
                      }}
                    >
                      Sepet
                    </span>
                  </div>
                  <div className="px-4 py-5">
                    <p style={{ color: "var(--ink-subtle)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Yeni sezon
                    </p>
                    <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 22, margin: "4px 0 8px" }}>
                      Öne çıkan ürünler
                    </h3>
                    <p style={{ color: "var(--ink-muted)", fontSize: 13, marginBottom: 12 }}>
                      Bu panel taslak token'larınızla anlık render edilir.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-md)",
                            boxShadow: "var(--shadow-sm)",
                            padding: 12,
                          }}
                        >
                          <div style={{ height: 56, background: "var(--surface-muted)", borderRadius: "var(--radius-sm)" }} />
                          <p style={{ fontSize: 12, marginTop: 8 }}>Ürün {i}</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>₺ 199,90</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <span
                        style={{
                          background: "var(--accent)",
                          color: "var(--accent-contrast)",
                          borderRadius: "var(--radius-md)",
                          padding: "8px 16px",
                          fontSize: 13,
                        }}
                      >
                        Alışverişe başla
                      </span>
                      <span
                        style={{
                          border: "1px solid var(--line-strong)",
                          borderRadius: "var(--radius-full, 9999px)",
                          padding: "6px 12px",
                          fontSize: 12,
                          color: "var(--ink-muted)",
                        }}
                      >
                        Filtre
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
