"use client";

/**
 * TODO-159D (ADR-093) — Hesabım > Tüm Listelerim (alışveriş listeleri yönetimi).
 *
 * Liste oluştur / yeniden adlandır / sil + detay bağlantısı. Varsayılan wishlist EN ÜSTTE
 * gösterilir (silinemez/yeniden-adlandırılamaz → yalnız "Aç"). Tüm mutasyonlar Server
 * Action'lara delege eder; sunucu 409/422 kodlarını kullanıcı-dostu mesaja çevirir.
 * Renkler yalnız token (hardcoded YOK).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Button } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerListSummary } from "@commerce-os/api-client";
import {
  createListAction,
  deleteListAction,
  renameListAction,
} from "../../../lib/server/list-actions";

type WishlistDict = StorefrontDictionary["account"]["wishlist"];

function messageForCode(code: string, t: WishlistDict): string {
  switch (code) {
    case "LIST_NAME_CONFLICT":
      return t.nameConflict;
    case "LIST_LIMIT_REACHED":
    case "LIST_ITEMS_LIMIT_REACHED":
      return t.limitReached;
    case "DEFAULT_LIST_IMMUTABLE":
      return t.defaultImmutable;
    default:
      return t.actionFailed;
  }
}

export function ListsSection({
  lists,
  t,
}: {
  lists: CustomerListSummary[];
  t: WishlistDict;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t.nameRequired);
      return;
    }
    startTransition(async () => {
      const result = await createListAction(trimmed);
      if (!result.ok) {
        setError(messageForCode(result.code, t));
        return;
      }
      setError(null);
      setName("");
      setCreating(false);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{t.listsTitle}</h1>
          <p className="mt-1 text-sm text-ink-subtle">{t.listsSubtitle}</p>
        </div>
        {!creating ? (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)} disabled={pending}>
            {t.createList}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {creating ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-4">
          <label className="sr-only" htmlFor="new-list-name">
            {t.createListPlaceholder}
          </label>
          <input
            id="new-list-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.createListPlaceholder}
            maxLength={60}
            className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <Button variant="primary" size="sm" onClick={create} disabled={pending}>
            {t.create}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCreating(false);
              setName("");
              setError(null);
            }}
            disabled={pending}
          >
            {t.cancel}
          </Button>
        </div>
      ) : null}

      {lists.length === 0 ? (
        <p className="mt-6 py-8 text-sm text-ink-subtle">{t.listsEmpty}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {lists.map((list) => (
            <ListRow key={list.id} list={list} t={t} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListRow({
  list,
  t,
  onChanged,
}: {
  list: CustomerListSummary;
  t: WishlistDict;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);

  const rename = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t.nameRequired);
      return;
    }
    startTransition(async () => {
      const result = await renameListAction(list.id, trimmed);
      if (!result.ok) {
        setError(messageForCode(result.code, t));
        return;
      }
      setError(null);
      setRenaming(false);
      onChanged();
    });
  };

  const remove = () => {
    if (!window.confirm(t.deleteConfirm)) return;
    startTransition(async () => {
      await deleteListAction(list.id);
      onChanged();
    });
  };

  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {renaming ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-ink"
            />
            <Button variant="primary" size="sm" onClick={rename} disabled={pending}>
              {t.save}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRenaming(false);
                setName(list.name);
                setError(null);
              }}
              disabled={pending}
            >
              {t.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">{list.name}</span>
            {list.isDefault ? <Badge tone="info">{t.savedBadge}</Badge> : null}
            <span className="text-xs text-ink-subtle">{format(t.itemCount, { count: list.itemCount })}</span>
          </div>
        )}

        {!renaming ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/account/lists/${list.id}`}
              className="rounded-sm border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
            >
              {t.openList}
            </Link>
            {!list.isDefault ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setRenaming(true)} disabled={pending}>
                  {t.rename}
                </Button>
                <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
                  {t.deleteList}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </li>
  );
}
