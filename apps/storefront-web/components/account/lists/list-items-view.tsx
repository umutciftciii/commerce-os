"use client";

/**
 * TODO-159D (ADR-093) — Liste öğeleri görünümü (favoriler + alışveriş listeleri ortak).
 *
 * Öğeler CANLI hidrasyonla gelir (fiyat/stok/görsel gateway'de çözülür). Aksiyonlar Server
 * Action'lara delege eder; başarı sonrası `router.refresh()` ile sunucu durumu tazelenir.
 * Sepete ekleme canlı otoriteye dayanır (stokta olmayan/pasif ATLANIR + özet gösterilir).
 * Renkler yalnız Theme Engine token'ları (hardcoded renk YOK).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerListItem, CustomerListSummary } from "@commerce-os/api-client";
import { formatMinor } from "../../../lib/money";
import { ProductMedia } from "../../ui/product-media";
import {
  addVariantToCartAction,
  batchAddListToCartAction,
  copyListItemAction,
  moveListItemAction,
  removeListItemAction,
} from "../../../lib/server/list-actions";

type WishlistDict = StorefrontDictionary["account"]["wishlist"];

export function ListItemsView({
  listId,
  items,
  otherLists,
  t,
  showAddAll = true,
}: {
  listId: string;
  items: CustomerListItem[];
  otherLists: CustomerListSummary[];
  t: WishlistDict;
  showAddAll?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  const addAll = () =>
    startTransition(async () => {
      const result = await batchAddListToCartAction(listId);
      if (!result.ok) {
        setFeedback({ tone: "error", text: t.actionFailed });
        return;
      }
      const parts = [format(t.addedToCart, { count: result.added })];
      if (result.skipped.length > 0) {
        parts.push(format(t.skippedSummary, { count: result.skipped.length }));
      }
      setFeedback({ tone: "info", text: parts.join(" ") });
      router.refresh();
    });

  if (items.length === 0) {
    return <p className="py-8 text-sm text-ink-subtle">{t.favoritesEmpty}</p>;
  }

  return (
    <div>
      {feedback ? (
        <Alert tone={feedback.tone === "error" ? "error" : "info"} className="mb-4">
          {feedback.text}
        </Alert>
      ) : null}

      {showAddAll ? (
        <div className="mb-6 flex justify-end">
          <Button variant="secondary" onClick={addAll} disabled={pending}>
            {t.addAllToCart}
          </Button>
        </div>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-4 rounded-md border border-line bg-surface p-4"
          >
            <div className="h-24 w-20 shrink-0 overflow-hidden rounded-sm border border-line bg-surface-muted">
              <ProductMedia handle={item.productSlug} title={item.productTitle} imageUrl={item.imageUrl} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-w-0">
                <a
                  href={`/products/${item.productSlug}`}
                  className="line-clamp-2 text-sm font-medium text-ink underline-offset-4 hover:underline"
                >
                  {item.productTitle}
                </a>
                {item.variantTitle ? (
                  <p className="mt-0.5 text-xs text-ink-subtle">{item.variantTitle}</p>
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                {item.priceMinor !== null && item.currency ? (
                  <span className="text-sm font-semibold text-ink">
                    {formatMinor(item.priceMinor, item.currency)}
                  </span>
                ) : null}
                {item.compareAtMinor !== null && item.currency ? (
                  <span className="text-xs text-ink-subtle line-through">
                    {formatMinor(item.compareAtMinor, item.currency)}
                  </span>
                ) : null}
                {item.availability === "UNAVAILABLE" ? (
                  <Badge tone="danger">{t.unavailable}</Badge>
                ) : item.availability === "OUT_OF_STOCK" ? (
                  <Badge tone="warning">{t.outOfStock}</Badge>
                ) : null}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pending || item.availability !== "AVAILABLE" || !item.addableVariantId}
                  onClick={() =>
                    run(async () => {
                      if (item.addableVariantId) await addVariantToCartAction(item.addableVariantId, item.quantity);
                    })
                  }
                >
                  {t.addToCart}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(async () => void (await removeListItemAction(listId, item.id)))}
                >
                  {t.remove}
                </Button>
                {otherLists.length > 0 ? (
                  <MoveCopyControl
                    listId={listId}
                    itemId={item.id}
                    otherLists={otherLists}
                    t={t}
                    disabled={pending}
                    onDone={() => router.refresh()}
                  />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoveCopyControl({
  listId,
  itemId,
  otherLists,
  t,
  disabled,
  onDone,
}: {
  listId: string;
  itemId: string;
  otherLists: CustomerListSummary[];
  t: WishlistDict;
  disabled: boolean;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const act = (mode: "move" | "copy") => {
    if (!target) return;
    startTransition(async () => {
      if (mode === "move") await moveListItemAction(listId, itemId, target);
      else await copyListItemAction(listId, itemId, target);
      onDone();
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <label className="sr-only" htmlFor={`move-${itemId}`}>
        {t.chooseList}
      </label>
      <select
        id={`move-${itemId}`}
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        disabled={disabled || pending}
        className="rounded-sm border border-line bg-surface px-2 py-1 text-xs text-ink"
      >
        <option value="">{t.chooseList}</option>
        {otherLists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="sm" disabled={disabled || pending || !target} onClick={() => act("move")}>
        {t.move}
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled || pending || !target} onClick={() => act("copy")}>
        {t.copy}
      </Button>
    </span>
  );
}
