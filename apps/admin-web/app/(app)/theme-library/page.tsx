"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Textarea,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { getLayoutPreset, listStartingPoints } from "@commerce-os/theme";
import { NativeSelect } from "../../../components/theme-library/native-select";
import type { LibraryTemplateSummary } from "@commerce-os/api-client";
import { ThemeLibraryIcon } from "../../../components/icons";
import { AssignmentDialog } from "../../../components/theme-library/assignment-dialog";
import { adminApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

/**
 * TODO-164B Dilim 2 — Platform "Tema Kütüphanesi" ana ekranı. Tüm platform theme
 * template'lerini (kütüphane sistem mağazası) tek tabloda gösterir; oluştur/düzenle/
 * kopyala/arşivle/ata/kullanım. Designer ayrı bir yüzeyde (/theme-library/[id]).
 */

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PUBLISHED: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
  INCOMPATIBLE: "danger",
  DISABLED: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Yayında",
  DRAFT: "Taslak",
  ARCHIVED: "Arşiv",
  INCOMPATIBLE: "Uyumsuz",
  DISABLED: "Pasif",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; templates: LibraryTemplateSummary[] }
  | { status: "error"; message: string };

export default function ThemeLibraryPage() {
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [assign, setAssign] = useState<LibraryTemplateSummary | null>(null);
  const [usage, setUsage] = useState<LibraryTemplateSummary | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await adminApi.listThemeLibrary();
      setState({ status: "ready", templates: res.templates });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onArchive(t: LibraryTemplateSummary) {
    try {
      await adminApi.archiveTemplate(t.id);
      void load();
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }

  const columns: DataTableColumn<LibraryTemplateSummary>[] = [
    {
      header: "Tema",
      cell: (t) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{t.name}</span>
          <span className="font-mono text-xs text-slate-500">{t.themeKey}</span>
        </div>
      ),
    },
    {
      header: "Durum",
      cell: (t) => (
        <div className="flex flex-col gap-1">
          <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
          {!t.compatible ? <Badge tone="danger">Uyumsuz</Badge> : null}
          {!t.policyComplete ? <Badge tone="warning">Policy eksik</Badge> : null}
        </div>
      ),
    },
    {
      header: "Sürüm",
      cell: (t) => (
        <div className="flex flex-col text-xs text-slate-600">
          <span>Yayın: {t.publishedVersion ?? "—"}</span>
          <span>Taslak: {t.draftVersion ?? "—"}</span>
        </div>
      ),
    },
    {
      header: "Kullanım",
      cell: (t) => (
        <div className="flex flex-col text-xs text-slate-600">
          <span>{t.usingCount} mağaza</span>
          {t.updatePendingCount > 0 ? (
            <span className="text-amber-600">{t.updatePendingCount} güncelleme bekliyor</span>
          ) : (
            <span className="text-slate-400">güncel</span>
          )}
        </div>
      ),
    },
    {
      header: "Kaynak",
      // §14 — ham preset anahtarı (BASE_COMMERCE vb.) yerine kullanıcı dostu ad (getLayoutPreset.nameTr).
      cell: (t) => (
        <span className="text-xs text-slate-500">
          {t.sourcePreset ? (getLayoutPreset(t.sourcePreset)?.nameTr ?? t.sourcePreset) : "—"}
        </span>
      ),
    },
    {
      header: "Son yayın",
      cell: (t) => (
        <span className="text-xs text-slate-500">
          {t.lastPublishedAt ? new Date(t.lastPublishedAt).toLocaleDateString(locale) : "—"}
        </span>
      ),
    },
    {
      header: "İşlem",
      align: "right",
      cell: (t) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => router.push(`/theme-library/${t.id}`)}>
            Düzenle
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAssign(t)}
            disabled={t.status !== "PUBLISHED"}
            title={t.status !== "PUBLISHED" ? "Yalnız yayınlanmış şablon atanabilir" : undefined}
          >
            Ata
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setUsage(t)}>
            Kullanım
          </Button>
          {t.status !== "PUBLISHED" && t.status !== "ARCHIVED" ? (
            <Button variant="secondary" size="sm" onClick={() => void onArchive(t)}>
              Arşivle
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const count = state.status === "ready" ? state.templates.length : 0;

  return (
    <>
      <PageHeader
        eyebrow="Görünüm"
        title="Tema Kütüphanesi"
        description="Platform tema şablonlarını oluşturun, düzenleyin, yayınlayın ve mağazalara atayın."
        actions={<Button onClick={() => setCreating(true)}>Yeni tema</Button>}
      />

      <SectionCard
        title="Platform şablonları"
        description={state.status === "ready" ? `${count} şablon` : "Yükleniyor…"}
        icon={<ThemeLibraryIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            title="Liste yüklenemedi"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Tekrar dene
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}
        {state.status === "ready" && state.templates.length === 0 ? (
          <EmptyState
            tag="Tema"
            title="Henüz şablon yok"
            description="İlk platform tema şablonunu oluşturun."
            icon={<ThemeLibraryIcon />}
          />
        ) : null}
        {state.status === "ready" && state.templates.length > 0 ? (
          <DataTable columns={columns} rows={state.templates} rowKey={(t) => t.id} caption="Platform tema şablonları" />
        ) : null}
      </SectionCard>

      {creating ? (
        <CreateTemplateModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/theme-library/${id}`);
          }}
        />
      ) : null}

      {assign ? (
        <AssignmentDialog
          templateId={assign.id}
          templateName={assign.name}
          onClose={() => setAssign(null)}
          onApplied={() => void load()}
        />
      ) : null}

      {usage ? <UsageModal template={usage} onClose={() => setUsage(null)} /> : null}
    </>
  );
}

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const locale = useLocale();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startingPoint, setStartingPoint] = useState("BASE_COMMERCE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const points = listStartingPoints();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await adminApi.createTemplate({
        name,
        description: description || undefined,
        startingPoint,
      });
      onCreated(created.id);
    } catch (err) {
      setError(messageForError(err, locale));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Yeni tema şablonu"
      description="Bir başlangıç noktası seçin ve şablonu oluşturun."
      closeLabel="Kapat"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button type="submit" form="create-template-form" disabled={busy || !name.trim()}>
            Oluştur
          </Button>
        </div>
      }
    >
      <form id="create-template-form" onSubmit={submit} className="space-y-3">
        {error ? (
          <Alert tone="error" title="Hata">
            {error}
          </Alert>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Ad</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Açıklama</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Başlangıç noktası</span>
          <NativeSelect value={startingPoint} onChange={(e) => setStartingPoint(e.target.value)}>
            {points.map((p) => (
              <option key={p.key} value={p.key}>
                {p.nameTr}
              </option>
            ))}
          </NativeSelect>
        </label>
      </form>
    </Modal>
  );
}

function UsageModal({ template, onClose }: { template: LibraryTemplateSummary; onClose: () => void }) {
  const locale = useLocale();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; rows: import("@commerce-os/api-client").TemplateUsageResponse } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    adminApi
      .templateUsage(template.id)
      .then((rows) => active && setState({ status: "ready", rows }))
      .catch((e) => active && setState({ status: "error", message: messageForError(e, locale) }));
    return () => {
      active = false;
    };
  }, [template.id, locale]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Kullanan mağazalar: ${template.name}`}
      description="Bu şablonu kullanan mağazalar ve güncelleme durumu."
      closeLabel="Kapat"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      {state.status === "loading" ? <SkeletonRows rows={3} /> : null}
      {state.status === "error" ? (
        <Alert tone="error" title="Hata">
          {state.message}
        </Alert>
      ) : null}
      {state.status === "ready" ? (
        state.rows.usage.length === 0 ? (
          <p className="text-sm text-slate-500">Bu şablonu kullanan mağaza yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {state.rows.usage.map((u) => (
              <li key={u.storeId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-slate-800">{u.storeName}</span>
                <span className="font-mono text-xs text-slate-400">v{u.sourceThemeVersion ?? "?"}</span>
                {u.updateAvailable ? (
                  <Badge tone="warning">Güncelleme var</Badge>
                ) : (
                  <Badge tone="success">Güncel</Badge>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Modal>
  );
}
