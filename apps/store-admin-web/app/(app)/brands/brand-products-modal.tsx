"use client";

// TODO-165A (ADR-165A) Task 15/16 gap — Marka "Bağlı ürünler" modalı. Task 6'nın COUNT-ONLY
// ucundan yükseltilmiş GERÇEK (sayfalanmış/aranabilir) ürün listesini gösterir; satırlar
// kapak görseli + başlık + SKU + durum taşır, tıklama `/products/[id]`'e gider (yeni sekme
// açmaz — düzenleme akışı ayrı bir dedicated route).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../components/ui";
import { DataGridPagination } from "../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import { ADMIN_LIST_DEFAULT_PAGE_SIZE, type Brand, type BrandProductRow } from "@commerce-os/api-client";
import { ProductIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

const STATUS_TONES: Record<BrandProductRow["status"], "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};
const STATUS_LABELS: Record<BrandProductRow["status"], string> = {
  ACTIVE: "Aktif",
  DRAFT: "Taslak",
  ARCHIVED: "Arşiv",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      rows: BrandProductRow[];
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
    };

export function BrandProductsModal({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const locale = useLocale();
  const g = getDictionary(locale).storeAdmin.dataGrid;

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_LIST_DEFAULT_PAGE_SIZE);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listBrandProducts(brand.id, {
        page,
        pageSize,
        search: search || undefined,
      });
      setState({ status: "ready", rows: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [brand.id, locale, page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<BrandProductRow>[] = [
    {
      header: "Ürün",
      cell: (product) => (
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.04]">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ProductIcon />
            )}
          </span>
          <span className="font-medium text-white/90">{product.title}</span>
        </div>
      ),
    },
    {
      header: "SKU",
      cell: (product) =>
        product.sku ? (
          <span className="font-mono text-xs text-white/45">{product.sku}</span>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
    {
      header: "Durum",
      cell: (product) => (
        <Badge tone={STATUS_TONES[product.status]}>{STATUS_LABELS[product.status]}</Badge>
      ),
    },
    {
      header: "İşlem",
      align: "right",
      cell: (product) => (
        <Link
          href={`/products/${product.id}`}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.06] px-3 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/80"
        >
          Görüntüle
        </Link>
      ),
    },
  ];

  const pagination = state.status === "ready" ? state.pagination : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Bağlı Ürünler"
      description={format("{name} markasına bağlı ürünler.", { name: brand.name })}
      closeLabel="Kapat"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      <div className="space-y-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
          className="flex gap-2"
        >
          <Input
            id="brand-products-search"
            placeholder="Ürün adında ara…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" size="sm">
            {g.searchSubmit}
          </Button>
        </form>

        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Tekrar dene
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && state.rows.length === 0 ? (
          <EmptyState
            tag="BAGLI_URUN_YOK"
            title={search ? "Sonuç bulunamadı" : "Bu markaya bağlı ürün yok"}
            description={
              search
                ? "Aramanızla eşleşen ürün bulunamadı."
                : "Ürün oluşturma/düzenleme ekranında bu markayı seçtiğinizde burada listelenir."
            }
            icon={<ProductIcon />}
          />
        ) : null}

        {state.status === "ready" && state.rows.length > 0 ? (
          <DataTable columns={columns} rows={state.rows} rowKey={(p) => p.id} caption="Bağlı ürünler" />
        ) : null}

        {pagination && pagination.totalItems > 0 ? (
          <DataGridPagination
            labels={{
              rangeLabel: g.rangeLabel,
              rangeEmpty: g.rangeEmpty,
              previousPage: g.previousPage,
              nextPage: g.nextPage,
              pageSizeLabel: g.pageSizeLabel,
              goToPage: g.goToPage,
              pageOf: g.pageOf,
            }}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        ) : null}
      </div>
    </Modal>
  );
}
