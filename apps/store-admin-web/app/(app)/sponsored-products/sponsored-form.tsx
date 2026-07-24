"use client";

/**
 * TODO-161 — Sponsorlu kampanya formu (create + edit). Ürün seçimi ADR-090 searchable
 * selector'ı (useProductSelectorBinding, çoklu); kategori hedefleme tek-seçim (opsiyonel).
 * placement create'te seçilir + sonrasında IMMUTABLE (ölçüm/slot semantiği tipe bağlı).
 * Keyword'ler SEARCH_RESULTS için query allowlist'i (sunucu normalize eder). Tüm mutasyonlar CSRF'li.
 */

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Alert, Button, Input, Select, Textarea } from "../../../components/ui";
import {
  EntitySelectorField,
  useProductSelectorBinding,
  useCategorySelectorBinding,
} from "../../../components/selector";
import type {
  SponsoredCampaignDetail,
  SponsoredCampaignCreateRequest,
  SponsoredCampaignUpdateRequest,
  SponsoredCampaignStatus,
  SponsoredPlacementType,
} from "@commerce-os/api-client";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";

type Locale = "tr" | "en";

export interface SponsoredFormLabels {
  name: string;
  placement: string;
  placementLabels: Record<SponsoredPlacementType, string>;
  status: string;
  statusLabels: Record<SponsoredCampaignStatus, string>;
  startsAt: string;
  endsAt: string;
  priority: string;
  priorityHint: string;
  maxSlots: string;
  targetCategory: string;
  targetCategoryHint: string;
  keywords: string;
  keywordsHint: string;
  products: string;
  productsHint: string;
  save: string;
  saving: string;
  cancel: string;
  nameRequired: string;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10); // YYYY-MM-DD
}

function toIsoOrNull(dateInput: string): string | null {
  const trimmed = dateInput.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function SponsoredCampaignForm({
  editing,
  labels,
  locale,
  onSaved,
  onCancel,
}: {
  editing: SponsoredCampaignDetail | null;
  labels: SponsoredFormLabels;
  locale: Locale;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const productSelector = useProductSelectorBinding(locale);
  const categorySelector = useCategorySelectorBinding(locale);
  const toMessage = useCallback((error: unknown) => messageForError(error, locale), [locale]);

  const [name, setName] = useState(editing?.name ?? "");
  const [placement, setPlacement] = useState<SponsoredPlacementType>(editing?.placement ?? "SEARCH_RESULTS");
  const [status, setStatus] = useState<SponsoredCampaignStatus>(editing?.status ?? "ACTIVE");
  const [startsAt, setStartsAt] = useState(toDateInput(editing?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(editing?.endsAt ?? null));
  const [priority, setPriority] = useState(String(editing?.priority ?? 0));
  const [maxSlots, setMaxSlots] = useState(String(editing?.maxSlots ?? 3));
  const [productIds, setProductIds] = useState<string[]>(editing?.products.map((p) => p.productId) ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(editing?.targetCategoryId ? [editing.targetCategoryId] : []);
  const [keywordsText, setKeywordsText] = useState((editing?.keywords ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const parsedKeywords = useMemo(
    () =>
      keywordsText
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) {
      setNameError(labels.nameRequired);
      return;
    }
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const shared = {
        name: name.trim(),
        status,
        startsAt: toIsoOrNull(startsAt),
        endsAt: toIsoOrNull(endsAt),
        priority: Number(priority) || 0,
        maxSlots: Number(maxSlots) || 1,
        targetCategoryId: categoryIds[0] ?? null,
        productIds,
        keywords: parsedKeywords,
      };
      if (editing) {
        const payload: SponsoredCampaignUpdateRequest = shared;
        const res = await storeApi.updateSponsoredCampaign(editing.id, payload);
        onSaved(res.data.id);
      } else {
        const payload: SponsoredCampaignCreateRequest = { ...shared, placement };
        const res = await storeApi.createSponsoredCampaign(payload);
        onSaved(res.data.id);
      }
    } catch (cause) {
      setError(messageForError(cause, locale));
      setBusy(false);
    }
  };

  const showKeywords = placement === "SEARCH_RESULTS";

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div>
        <Input label={labels.name} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        {nameError ? <p className="mt-1 text-xs text-rose-300">{nameError}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label={labels.placement}
          value={placement}
          onChange={(e) => setPlacement(e.target.value as SponsoredPlacementType)}
          disabled={busy || editing !== null}
          options={(["SEARCH_RESULTS", "HOME_SHOWCASE"] as SponsoredPlacementType[]).map((value) => ({
            value,
            label: labels.placementLabels[value],
          }))}
        />
        <Select
          label={labels.status}
          value={status}
          onChange={(e) => setStatus(e.target.value as SponsoredCampaignStatus)}
          disabled={busy}
          options={(["ACTIVE", "PAUSED", "ARCHIVED"] as SponsoredCampaignStatus[]).map((value) => ({
            value,
            label: labels.statusLabels[value],
          }))}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input label={labels.startsAt} type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={busy} />
        <Input label={labels.endsAt} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={busy} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Input label={labels.priority} type="number" min={0} max={1000} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={busy} />
          <p className="mt-1 text-xs text-white/40">{labels.priorityHint}</p>
        </div>
        <Input label={labels.maxSlots} type="number" min={1} max={24} value={maxSlots} onChange={(e) => setMaxSlots(e.target.value)} disabled={busy} />
      </div>

      <EntitySelectorField
        label={labels.products}
        multiple
        value={productIds}
        onChange={setProductIds}
        source={productSelector.source}
        presenter={productSelector.presenter}
        labels={productSelector.labels}
        toMessage={toMessage}
        modalTitle={productSelector.title}
        modalDescription={productSelector.description}
        disabled={busy}
      />
      <p className="text-xs text-white/40">{labels.productsHint}</p>

      <EntitySelectorField
        label={labels.targetCategory}
        multiple={false}
        value={categoryIds}
        onChange={setCategoryIds}
        source={categorySelector.source}
        presenter={categorySelector.presenter}
        labels={categorySelector.labels}
        toMessage={toMessage}
        modalTitle={categorySelector.title}
        modalDescription={categorySelector.description}
        disabled={busy}
      />
      <p className="text-xs text-white/40">{labels.targetCategoryHint}</p>

      {showKeywords ? (
        <div>
          <Textarea
            label={labels.keywords}
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            rows={2}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-white/40">{labels.keywordsHint}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? labels.saving : labels.save}
        </Button>
      </div>
    </form>
  );
}
