"use client";

// TODO-165 (ADR-249) — Beden Tablosu (SizeChart) yönetimi: liste + "Yeni" oluşturma modalı.
// Dedicated rota (`/size-charts`), FASHION_VERTICAL modülüne bağlı (layout ModuleGuard). Beden
// sistemi SERBEST JSON DEĞİL; tipli registry'den (`@commerce-os/contracts/size-systems`) seçilir.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  SectionCard,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import type { SizeChartContract, SizeChartCreateRequest } from "@commerce-os/api-client";
import {
  SIZE_SYSTEM_REGISTRY,
  getSizeSystem,
  isSizeSystemKey,
  type SizeSystemKey,
} from "@commerce-os/contracts/size-systems";
import { AttributeIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type SizeChartStatus = SizeChartContract["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; charts: SizeChartContract[] };

const STATUS_TONES: Record<SizeChartStatus, "success" | "neutral" | "warning"> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};
const STATUS_LABELS: Record<SizeChartStatus, string> = {
  DRAFT: "Taslak",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşiv",
};
const MEASUREMENT_UNITS = ["CM", "IN", "NONE"] as const;

function sizeSystemLabel(key: string, locale: string): string {
  if (!isSizeSystemKey(key)) return key;
  const def = getSizeSystem(key);
  return locale === "tr" ? def.labelTr : def.labelEn;
}

export default function SizeChartsPage() {
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSizeCharts();
      setState({ status: "ready", charts: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const charts = state.status === "ready" ? state.charts : [];

  const columns: DataTableColumn<SizeChartContract>[] = [
    {
      header: "Ad",
      cell: (chart) => (
        <div>
          <p className="font-medium text-white/90">{chart.name}</p>
          <p className="text-xs text-white/30">{sizeSystemLabel(chart.sizeSystemKey, locale)}</p>
        </div>
      ),
    },
    {
      header: "Cinsiyet",
      cell: (chart) => <span className="text-white/45">{chart.gender ?? "—"}</span>,
    },
    {
      header: "Birim",
      cell: (chart) => <span className="text-white/45">{chart.measurementUnit || "—"}</span>,
    },
    {
      header: "Atama",
      cell: (chart) => (
        <span className="text-white/45">
          {chart.assignments.length === 0 ? "—" : `${chart.assignments.length} kapsam`}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: (chart) => <Badge tone={STATUS_TONES[chart.status]}>{STATUS_LABELS[chart.status]}</Badge>,
    },
    {
      header: "İşlem",
      align: "right",
      cell: (chart) => (
        <div className="flex justify-end">
          <Link
            href={`/size-charts/${chart.id}`}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.06] px-3 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/80"
          >
            Düzenle
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Moda"
        title="Beden Tabloları"
        description="Ürünlerinize bağlanacak ölçü tablolarını (santim/inch) tipli beden sistemleriyle yönetin."
        actions={<Button onClick={() => setCreating(true)}>Yeni Tablo</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                Kapat
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title="Tablolar"
        description={
          state.status === "ready" ? `${charts.length} tablo` : "Beden ölçü tabloları"
        }
        icon={<AttributeIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            title="Tablolar yüklenemedi"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Tekrar dene
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && charts.length === 0 ? (
          <EmptyState
            tag="BEDEN_TABLOSU"
            title="Henüz beden tablosu yok"
            description="İlk ölçü tablonuzu oluşturun; sonra kolonları ve bedenleri düzenleyip yayınlayın."
            icon={<AttributeIcon />}
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                Yeni Tablo
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && charts.length > 0 ? (
          <DataTable
            columns={columns}
            rows={charts}
            rowKey={(chart) => chart.id}
            caption="Beden tabloları"
          />
        ) : null}
      </SectionCard>

      {creating ? (
        <CreateSizeChart
          locale={locale}
          onClose={() => setCreating(false)}
          onCreated={(chart) => {
            setCreating(false);
            router.push(`/size-charts/${chart.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function CreateSizeChart({
  locale,
  onClose,
  onCreated,
}: {
  locale: ReturnType<typeof useLocale>;
  onClose: () => void;
  onCreated: (chart: SizeChartContract) => void;
}) {
  const [name, setName] = useState("");
  const [sizeSystemKey, setSizeSystemKey] = useState<SizeSystemKey>(SIZE_SYSTEM_REGISTRY[0]!.key);
  const [measurementUnit, setMeasurementUnit] = useState<string>("");
  const [gender, setGender] = useState("");
  const [localeInput, setLocaleInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length === 0) {
      setError("Tablo adı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const payload: SizeChartCreateRequest = {
        name: name.trim(),
        sizeSystemKey,
        measurementUnit: measurementUnit.length > 0 ? measurementUnit : undefined,
        gender: gender.trim().length > 0 ? gender.trim() : null,
        locale: localeInput.trim().length > 0 ? localeInput.trim() : null,
      };
      const result = await storeApi.createSizeChart(payload);
      onCreated(result.data);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Yeni Beden Tablosu"
      description="Beden sistemini seçin; kolon ve bedenleri sonraki adımda düzenleyeceksiniz."
      closeLabel="İptal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button type="submit" form="size-chart-create-form" disabled={saving}>
            {saving ? "Kaydediliyor…" : "Oluştur"}
          </Button>
        </>
      }
    >
      <form id="size-chart-create-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="size-chart-name"
          label="Tablo Adı"
          placeholder="Örn. Kadın Üst Giyim"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          required
        />
        <Select
          id="size-chart-system"
          label="Beden Sistemi"
          value={sizeSystemKey}
          onChange={(event) => setSizeSystemKey(event.target.value as SizeSystemKey)}
          disabled={saving}
          options={SIZE_SYSTEM_REGISTRY.map((def) => ({
            value: def.key,
            label: locale === "tr" ? def.labelTr : def.labelEn,
          }))}
        />
        <Select
          id="size-chart-unit"
          label="Ölçü Birimi (opsiyonel)"
          value={measurementUnit}
          onChange={(event) => setMeasurementUnit(event.target.value)}
          disabled={saving}
          options={[
            { value: "", label: "Varsayılan" },
            ...MEASUREMENT_UNITS.map((unit) => ({ value: unit, label: unit })),
          ]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="size-chart-gender"
            label="Cinsiyet (opsiyonel)"
            placeholder="Kadın / Erkek / Unisex"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            disabled={saving}
          />
          <Input
            id="size-chart-locale"
            label="Dil (opsiyonel)"
            placeholder="tr / en"
            value={localeInput}
            onChange={(event) => setLocaleInput(event.target.value)}
            disabled={saving}
          />
        </div>
      </form>
    </Modal>
  );
}
