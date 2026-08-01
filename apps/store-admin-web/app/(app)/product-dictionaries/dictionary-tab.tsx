"use client";

// TODO-165A (ADR-165A) Task 24 — bir governed taksonomi tipi (ör. Materyal) icin liste
// (arama + kullanım sayısı + durum) + oluşturma/düzenleme + sıralama (tam AKTİF küme) +
// arşivle/geri-yükle + sil (409 kullanımda uyarısı). `hero/page.tsx` (yukarı/aşağı butonlu
// sıralama) + `attributes/page.tsx` (DataTable + Modal editör) desenlerinin birleşimi.
//
// Sıralama: `reorder` ucu bir tip için TAM AKTİF kümeyi ister (kısmi küme 400 döner). Bu yüzden
// yukarı/aşağı butonları YALNIZ aktif satırların KENDİ ARALARINDAKİ sırasını değiştirir (arşiv
// satırları listeye dahil ama sıralamaya karışmaz) — `activeItems` (durum=ACTIVE, mevcut
// displayOrder sırasıyla, sunucu zaten böyle döner) TEK doğru kaynak.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProductTaxonomyTypeContract, ProductTaxonomyValue } from "@commerce-os/api-client";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  SectionCard,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { AttributeIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { taxonomyErrorMessage } from "./taxonomy-errors";
import { TaxonomyEditor, type TaxonomyEditorState } from "./taxonomy-editor";

type Status = ProductTaxonomyValue["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ProductTaxonomyValue[] };

const STATUS_TONES: Record<Status, "success" | "neutral"> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
};
const STATUS_LABELS: Record<Status, string> = {
  ACTIVE: "Aktif",
  ARCHIVED: "Arşiv",
};

export function DictionaryTab({
  type,
  typeLabel,
}: {
  type: ProductTaxonomyTypeContract;
  typeLabel: string;
}) {
  const locale = useLocale();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<TaxonomyEditorState>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // pageSize=100 (allowlist'teki üst sınır) — governed sözlükler küçük/sınırlı kümelerdir
  // (kanonik ~4-14 + mağaza-özel ekler); sıralama TAM AKTİF kümeyi gerektirdiğinden burada
  // sayfalama YOK, tipin tüm değerleri tek turda çekilir.
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listProductTaxonomy({ type, pageSize: 100 });
      setState({ status: "ready", items: result.data });
    } catch (error) {
      setState({ status: "error", message: taxonomyErrorMessage(error, locale) });
    }
  }, [type, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = state.status === "ready" ? state.items : [];

  // Sunucu list()'i displayOrder'a göre sıralı döner — filtre bu sırayı BOZMAZ.
  const activeItems = useMemo(() => items.filter((v) => v.status === "ACTIVE"), [items]);

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle ? items.filter((v) => v.name.toLowerCase().includes(needle)) : items;
    // Aktif satırlar üstte (kendi displayOrder sırasıyla), arşiv altta — karışık görünüm yerine
    // net gruplama.
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      return a.displayOrder - b.displayOrder;
    });
  }, [items, search]);

  function onSaved(message: string) {
    setEditor(null);
    setNotice({ tone: "success", text: message });
    void load();
  }

  async function onMove(item: ProductTaxonomyValue, direction: -1 | 1) {
    const index = activeItems.findIndex((v) => v.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeItems.length) return;
    const next = [...activeItems];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      await storeApi.reorderProductTaxonomy({ type, orderedIds: next.map((v) => v.id) });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: taxonomyErrorMessage(error, locale) });
    } finally {
      setReordering(false);
    }
  }

  async function onToggleStatus(item: ProductTaxonomyValue) {
    setBusyId(item.id);
    try {
      if (item.status === "ACTIVE") {
        await storeApi.archiveProductTaxonomyValue(item.id);
        setNotice({ tone: "success", text: "Değer arşivlendi." });
      } else {
        await storeApi.restoreProductTaxonomyValue(item.id);
        setNotice({ tone: "success", text: "Değer geri yüklendi." });
      }
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: taxonomyErrorMessage(error, locale) });
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(item: ProductTaxonomyValue) {
    if (!window.confirm(`"${item.name}" değerini kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    setBusyId(item.id);
    try {
      await storeApi.deleteProductTaxonomyValue(item.id);
      setNotice({ tone: "success", text: "Değer silindi." });
      await load();
    } catch (error) {
      // 409 TAXONOMY_IN_USE burada "kullanımda, silinemez" olarak yüzeye çıkar.
      setNotice({ tone: "error", text: taxonomyErrorMessage(error, locale) });
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<ProductTaxonomyValue>[] = [
    {
      header: "Ad",
      cell: (v) => (
        <div>
          <p className="font-medium text-white/90">{v.name}</p>
          <p className="font-mono text-xs text-white/30">{v.slug}</p>
        </div>
      ),
    },
    {
      header: "Kullanım",
      cell: (v) =>
        v.usageCount > 0 ? (
          <Badge tone="info">{v.usageCount} üründe/varyantta</Badge>
        ) : (
          <span className="text-white/30">Kullanılmıyor</span>
        ),
    },
    {
      header: "Durum",
      cell: (v) => <Badge tone={STATUS_TONES[v.status]}>{STATUS_LABELS[v.status]}</Badge>,
    },
    {
      header: "Sıra",
      cell: (v) => {
        if (v.status !== "ACTIVE") return <span className="text-white/20">—</span>;
        const index = activeItems.findIndex((item) => item.id === v.id);
        return (
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Yukarı taşı"
              disabled={reordering || index <= 0}
              onClick={() => void onMove(v, -1)}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Aşağı taşı"
              disabled={reordering || index === activeItems.length - 1}
              onClick={() => void onMove(v, 1)}
            >
              ↓
            </Button>
          </div>
        );
      },
    },
    {
      header: "İşlemler",
      align: "right",
      cell: (v) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", value: v })}>
            Düzenle
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === v.id}
            onClick={() => void onToggleStatus(v)}
          >
            {v.status === "ACTIVE" ? "Arşivle" : "Geri Yükle"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === v.id || v.usageCount > 0}
            title={v.usageCount > 0 ? "Kullanımda; önce ürünlerden kaldırın." : undefined}
            onClick={() => void onDelete(v)}
          >
            Sil
          </Button>
        </div>
      ),
    },
  ];

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <SectionCard
      title={typeLabel}
      description={
        state.status === "ready"
          ? `${activeItems.length} aktif değer${items.length > activeItems.length ? ` · ${items.length - activeItems.length} arşiv` : ""}`
          : "Sözlük değerleri"
      }
      icon={<AttributeIcon />}
      actions={<Button onClick={() => setEditor({ mode: "create", type })}>Yeni Değer</Button>}
    >
      <form onSubmit={onSearchSubmit} className="mb-4 max-w-xs">
        <Input
          id={`dictionary-search-${type}`}
          placeholder="Ara…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={`${typeLabel} içinde ara`}
        />
      </form>

      {notice ? (
        <div className="mb-4">
          <Alert
            tone={notice.tone}
            action={
              <button type="button" className="underline" onClick={() => setNotice(null)}>
                Kapat
              </button>
            }
          >
            {notice.text}
          </Alert>
        </div>
      ) : null}

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

      {state.status === "ready" && visibleItems.length === 0 ? (
        <EmptyState
          tag="SOZLUK"
          title={search ? "Sonuç bulunamadı" : "Henüz değer yok"}
          description={
            search
              ? "Arama kriterlerinize uyan bir değer yok."
              : `${typeLabel} sözlüğüne ilk değeri ekleyin.`
          }
          icon={<AttributeIcon />}
          action={
            search ? undefined : (
              <Button size="sm" onClick={() => setEditor({ mode: "create", type })}>
                Yeni Değer
              </Button>
            )
          }
        />
      ) : null}

      {state.status === "ready" && visibleItems.length > 0 ? (
        <DataTable columns={columns} rows={visibleItems} rowKey={(v) => v.id} caption={typeLabel} />
      ) : null}

      {editor ? (
        <TaxonomyEditor editor={editor} typeLabel={typeLabel} onClose={() => setEditor(null)} onSaved={onSaved} />
      ) : null}
    </SectionCard>
  );
}
