"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Select, useLocale } from "@commerce-os/ui";
import { adminApi } from "../../lib/client/api";
import { messageForError } from "../../lib/client/messages";
import { EntityTypeahead, type TypeaheadItem } from "./entity-typeahead";
import { TOPIC_KEYS, topicLabel } from "./labels";

interface StoreOption {
  id: string;
  name: string;
}

// Loose accessor: selector/list responses vary (items vs data).
function listOf(r: unknown): Array<Record<string, unknown>> {
  const o = r as { items?: unknown[]; data?: unknown[] };
  return (o.items ?? o.data ?? []) as Array<Record<string, unknown>>;
}

export function MappingsPanel({ questionSetId, isDefault }: { questionSetId: string; isDefault: boolean }) {
  const locale = useLocale() as "tr" | "en";
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [topic, setTopic] = useState(TOPIC_KEYS[0]);
  const [defaultTopic, setDefaultTopic] = useState(TOPIC_KEYS[0]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi
      .listStores()
      .then((r) => setStores(listOf(r).map((s) => ({ id: String(s.id), name: String(s.name ?? s.slug ?? s.id) }))))
      .catch(() => setStores([]));
  }, []);

  const t = useMemo(
    () => ({
      hierarchy:
        locale === "tr"
          ? "Çözümleme önceliği: 1) Mağaza + Ürün  2) Kategori  3) Platform Varsayılanı. Üstteki eşleşme alttakini geçersiz kılar."
          : "Resolution priority: 1) Store + Product  2) Category  3) Platform Default. A higher match overrides lower ones.",
      chooseStore: locale === "tr" ? "Mağaza seçin" : "Choose a store",
      topic: locale === "tr" ? "Konu" : "Topic",
      product: locale === "tr" ? "Ürün ara…" : "Search product…",
      category: locale === "tr" ? "Kategori ara…" : "Search category…",
      assign: locale === "tr" ? "Bu sete ata" : "Assign to this set",
    }),
    [locale],
  );

  const run = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setNotice(ok);
      } catch (e) {
        setError(messageForError(e, locale));
      } finally {
        setBusy(false);
      }
    },
    [locale],
  );

  const productFetcher = useCallback(
    async (search: string): Promise<TypeaheadItem[]> => {
      if (!storeId) return [];
      const r = await adminApi.searchStoreProducts(storeId, search);
      return listOf(r).map((p) => ({ id: String(p.id), label: String(p.title ?? p.name ?? p.id), sublabel: p.sku ? String(p.sku) : undefined }));
    },
    [storeId],
  );
  const categoryFetcher = useCallback(
    async (search: string): Promise<TypeaheadItem[]> => {
      if (!storeId) return [];
      const r = await adminApi.searchStoreCategories(storeId, search);
      return listOf(r).map((c) => ({ id: String(c.id), label: String(c.name ?? c.title ?? c.id), sublabel: c.path ? String(c.path) : undefined }));
    },
    [storeId],
  );

  async function assignProduct(item: TypeaheadItem) {
    await run(
      () => adminApi.upsertSupportMapping(storeId, { scope: "PRODUCT", targetId: item.id, topic: topic as never, questionSetId }),
      `${item.label} — ${topicLabel(topic, locale)} ✓`,
    );
  }
  async function assignCategory(item: TypeaheadItem) {
    await run(
      () => adminApi.upsertSupportMapping(storeId, { scope: "CATEGORY", targetId: item.id, topic: topic as never, questionSetId }),
      `${item.label} — ${topicLabel(topic, locale)} ✓`,
    );
  }
  async function makeDefault() {
    await run(
      () => adminApi.upsertSupportTopicDefault({ topic: defaultTopic as never, questionSetId }),
      `${topicLabel(defaultTopic, locale)} → ${locale === "tr" ? "platform varsayılanı" : "platform default"} ✓`,
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">{t.hierarchy}</Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="rounded-md border border-slate-200 p-3">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{locale === "tr" ? "Mağaza (bağlam)" : "Store (context)"}</span>
            <Select
              aria-label={t.chooseStore}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              options={[{ value: "", label: t.chooseStore }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{t.topic}</span>
            <Select
              aria-label={t.topic}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              options={TOPIC_KEYS.map((k) => ({ value: k, label: topicLabel(k, locale) }))}
            />
          </label>
        </div>

        {storeId ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">
                <Badge tone="info">1</Badge> {locale === "tr" ? "Mağaza + Ürün" : "Store + Product"}
              </p>
              <EntityTypeahead placeholder={t.product} fetcher={productFetcher} onSelect={assignProduct} disabled={busy} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">
                <Badge tone="info">2</Badge> {locale === "tr" ? "Kategori" : "Category"}
              </p>
              <EntityTypeahead placeholder={t.category} fetcher={categoryFetcher} onSelect={assignCategory} disabled={busy} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.chooseStore}.</p>
        )}
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-medium">
          <Badge tone="info">3</Badge> {locale === "tr" ? "Platform Varsayılanı" : "Platform Default"}
          {isDefault ? <Badge tone="success">{locale === "tr" ? "Varsayılan set" : "Default set"}</Badge> : null}
        </p>
        <p className="mb-2 text-xs text-slate-500">
          {locale === "tr"
            ? "Hiçbir ürün/kategori eşleşmezse bu konuda çalışacak sete geri düşülür. Her konu için bir varsayılan olmalıdır (dead-end yok)."
            : "Fallback set for a topic when no product/category matches. Every topic must have one default (no dead-end)."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            aria-label={t.topic}
            value={defaultTopic}
            onChange={(e) => setDefaultTopic(e.target.value)}
            options={TOPIC_KEYS.map((k) => ({ value: k, label: topicLabel(k, locale) }))}
          />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void makeDefault()}>
            {locale === "tr" ? "Bu konunun varsayılanı yap" : "Make default for this topic"}
          </Button>
        </div>
      </div>
    </div>
  );
}
