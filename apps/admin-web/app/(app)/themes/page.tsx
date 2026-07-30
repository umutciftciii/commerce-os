"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import type { ThemeBindingSummary } from "@commerce-os/api-client";
import { ThemeIcon } from "../../../components/icons";
import { ThemeBindingPanel } from "../../../components/theme-binding-panel";
import { adminApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

/**
 * TODO-164 — Platform Admin "Tema Yönetimi" (fleet). Tüm mağazaların aktif tema
 * durumunu tek tabloda gösterir (aktif tema, layout preset, uyumluluk, Theme Studio)
 * ve satırdan tema yönetimini (atama + revision/rollback/uyarı) açar. Tema yönetimi
 * artık mağaza düzenleme modalına gömülü DEĞİL — kendi keşfedilebilir yüzeyinde.
 */

const KIND_LABEL: Record<string, string> = {
  BASE: "Temel",
  LAYOUT_PRESET: "Layout Preset",
  CUSTOM_PACKAGE: "Özel Paket",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; bindings: ThemeBindingSummary[] }
  | { status: "error"; message: string };

export default function ThemeManagementPage() {
  const locale = useLocale();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [manage, setManage] = useState<ThemeBindingSummary | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await adminApi.listThemeBindings();
      setState({ status: "ready", bindings: result.bindings });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<ThemeBindingSummary>[] = [
    {
      header: "Mağaza",
      cell: (b) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{b.storeName}</span>
          <span className="font-mono text-xs text-slate-500">{b.storeSlug}</span>
        </div>
      ),
    },
    {
      header: "Aktif tema",
      cell: (b) => (
        <div className="flex flex-col">
          <span className="text-slate-900">{b.activeThemeName}</span>
          <span className="text-xs text-slate-500">{KIND_LABEL[b.kind] ?? b.kind}</span>
        </div>
      ),
    },
    { header: "Layout preset", cell: (b) => <span className="text-slate-600">{b.layoutPreset}</span> },
    {
      header: "Uyumluluk",
      cell: (b) =>
        b.compatible ? (
          <Badge tone="success">Uyumlu</Badge>
        ) : (
          <Badge tone="danger">Uyumsuz</Badge>
        ),
    },
    {
      header: "Theme Studio",
      cell: (b) =>
        b.capabilityEnabled ? (
          <Badge tone="neutral">açık</Badge>
        ) : (
          <Badge tone="warning">kapalı</Badge>
        ),
    },
    {
      header: "İşlem",
      align: "right",
      cell: (b) => (
        <Button variant="secondary" size="sm" onClick={() => setManage(b)}>
          Yönet
        </Button>
      ),
    },
  ];

  function onManaged() {
    setManage(null);
    void load();
  }

  const count = state.status === "ready" ? state.bindings.length : 0;

  return (
    <>
      <PageHeader
        eyebrow="Görünüm"
        title="Tema Yönetimi"
        description="Tüm mağazaların aktif temasını, layout presetini ve uyumluluğunu tek yerden görüntüle ve yönet."
      />

      <SectionCard
        title="Mağaza temaları"
        description={state.status === "ready" ? `${count} mağaza` : "Yükleniyor…"}
        icon={<ThemeIcon />}
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

        {state.status === "ready" && state.bindings.length === 0 ? (
          <EmptyState
            tag="Tema"
            title="Mağaza yok"
            description="Henüz mağaza bulunmuyor."
            icon={<ThemeIcon />}
          />
        ) : null}

        {state.status === "ready" && state.bindings.length > 0 ? (
          <DataTable
            columns={columns}
            rows={state.bindings}
            rowKey={(b) => b.storeId}
            caption="Mağaza temaları"
          />
        ) : null}
      </SectionCard>

      {manage ? (
        <Modal
          open
          onClose={() => setManage(null)}
          title={`Tema: ${manage.storeName}`}
          description="Aktif tema, uyumluluk, revizyonlar ve tema atama."
          closeLabel="Kapat"
          footer={
            <Button variant="secondary" onClick={() => setManage(null)}>
              Kapat
            </Button>
          }
        >
          <ThemeBindingPanel storeId={manage.storeId} onChanged={onManaged} />
        </Modal>
      ) : null}
    </>
  );
}
