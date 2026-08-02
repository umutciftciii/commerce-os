"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Modal, Spinner, useLocale } from "@commerce-os/ui";
import type {
  AssignableStoresResponse,
  ThemeAssignPreviewResponse,
  RolloutSummaryResponse,
} from "@commerce-os/api-client";
import { adminApi } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";
import { BeforeAfter } from "./before-after";

/**
 * TODO-164B Dilim 2 (ADR-240/241) — Tema atama + controlled rollout diyaloğu. Akış:
 * mağaza seç → dry-run önizleme (uyumluluk + before/after) → explicit apply → per-store
 * sonuç (success/failed/skipped). Bir mağaza başarısız olduğunda diğerleri sessizce
 * başarılı SAYILMAZ (sayaçlar ayrı gösterilir).
 */

type Step = "select" | "preview" | "result";

const MODE_LABEL: Record<string, string> = {
  single: "Tek mağaza",
  selected: "Seçili mağazalar",
  pilot: "Pilot grup",
  "all-compatible": "Tüm uyumlu mağazalar",
};

// §14 — ham reason kodu yerine kullanıcı dostu mesaj (ham kod title'da ikincil teknik detay).
const REASON_CODE_LABEL: Record<string, string> = {
  TEMPLATE_NOT_PUBLISHED: "Şablon yayınlanmamış",
  THEME_INCOMPATIBLE: "Tema uyumsuz",
  NO_UPDATE_PENDING: "Bekleyen güncelleme yok",
  STORE_HAS_NO_THEME: "Mağazada tema yok",
  ASSIGN_ERROR: "Atama hatası",
};
function reasonLabel(code: string | undefined): string {
  if (!code) return "";
  return REASON_CODE_LABEL[code] ?? code;
}

export function AssignmentDialog({
  templateId,
  templateName,
  updateOnly,
  onClose,
  onApplied,
}: {
  templateId: string;
  templateName: string;
  /** true → yalnız update bekleyen mağazalara uygula (version update apply). */
  updateOnly?: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const locale = useLocale();
  const [step, setStep] = useState<Step>("select");
  const [stores, setStores] = useState<AssignableStoresResponse["stores"]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ThemeAssignPreviewResponse | null>(null);
  const [result, setResult] = useState<RolloutSummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.assignableStores();
      setStores(res.stores);
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleStore(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const storeIds = [...selected];

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.assignPreview(templateId, { storeIds });
      setPreview(res);
      setStep("preview");
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const input = { storeIds, mode: "selected" as const };
      const res = updateOnly
        ? await adminApi.applyTemplateUpdate(templateId, input)
        : await adminApi.assignTemplate(templateId, input);
      setResult(res);
      setStep("result");
      onApplied();
    } catch (e) {
      setError(messageForError(e, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={updateOnly ? `Versiyon güncelle: ${templateName}` : `Mağazalara ata: ${templateName}`}
      description={
        step === "select"
          ? "Hedef mağazaları seçin, önizleyin ve uygulayın."
          : step === "preview"
            ? "Uygulanmadan önce uyumluluk ve değişiklikleri gözden geçirin."
            : "Rollout sonucu."
      }
      closeLabel="Kapat"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {step === "select" ? (
            <Button onClick={() => void runPreview()} disabled={busy || storeIds.length === 0}>
              Önizle ({storeIds.length})
            </Button>
          ) : null}
          {step === "preview" ? (
            <Button onClick={() => void apply()} disabled={busy}>
              {updateOnly ? "Güncellemeyi uygula" : "Atamayı uygula"}
            </Button>
          ) : null}
        </div>
      }
    >
      {error ? (
        <Alert tone="error" title="Hata">
          {error}
        </Alert>
      ) : null}

      {busy ? (
        <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
          <Spinner /> İşleniyor…
        </div>
      ) : null}

      {step === "select" ? (
        <div className="space-y-2">
          {stores.length === 0 ? (
            <p className="text-sm text-slate-500">Atanabilir mağaza yok.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {stores.map((s) => {
                const usesThis = s.sourceThemeId === templateId;
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleStore(s.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-sm text-slate-800">{s.name}</span>
                      <span className="font-mono text-xs text-slate-400">{s.slug}</span>
                      {usesThis ? (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                          bu şablon · v{s.sourceThemeVersion ?? "?"}
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-4">
          {preview.previews.map((p) => (
            <div key={p.storeId} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-800">{p.storeName}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    p.compatible ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {p.compatible ? "Uyumlu" : "Uyumsuz"}
                </span>
              </div>
              {!p.compatible && p.issues.length > 0 ? (
                <Alert tone="warning" title="Uyumluluk uyarısı">
                  {p.issues.map((i) => i.message).join(" · ")}
                </Alert>
              ) : null}
              <BeforeAfter summary={p.summary} />
            </div>
          ))}
        </div>
      ) : null}

      {step === "result" && result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
              Başarılı: {result.succeeded}
            </span>
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-700">
              Başarısız: {result.failed}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
              Atlanan: {result.skipped}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-500">Mod: {MODE_LABEL[result.mode] ?? result.mode}</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {result.results.map((r) => (
              <li key={r.storeId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-slate-700">{r.storeName ?? r.storeId}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    r.status === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.status === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {r.status === "success"
                    ? `Uygulandı (v${r.newVersion ?? "?"})`
                    : r.status === "failed"
                      ? `Başarısız · ${reasonLabel(r.reasonCode)}`
                      : `Atlandı · ${reasonLabel(r.reasonCode)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
