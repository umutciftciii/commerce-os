"use client";

/**
 * TODO-161 — Sponsorlu kampanya formu (create + edit). Ürün seçimi ADR-090 searchable
 * selector'ı (useProductSelectorBinding, çoklu); kategori hedefleme tek-seçim (opsiyonel).
 * placement create'te seçilir + sonrasında IMMUTABLE (ölçüm/slot semantiği tipe bağlı).
 * Keyword'ler SEARCH_RESULTS için query allowlist'i (sunucu normalize eder). Tüm mutasyonlar CSRF'li.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  SponsoredCommercialMode,
  SponsoredPlacementType,
  SponsorAccountSummary,
} from "@commerce-os/api-client";
import { storeApi, UiError, type SponsorshipEligibleAgreement } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor, inputToMinor } from "../../../lib/client/format";
import {
  AGREEMENT_STATUS_LABELS,
  INELIGIBILITY_LABELS,
  PRICING_MODEL_LABELS,
  sponsorshipError,
} from "../sponsors/labels";

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
  // TODO-161A.2 (ADR-128) — birleşik ticari akış: kampanya tipi + sponsor/anlaşma bağlama.
  commercial: {
    mode: string;
    modeHint: string;
    sponsored: string;
    internal: string;
    sponsor: string;
    sponsorPlaceholder: string;
    agreement: string;
    agreementPlaceholder: string;
    agreementLoading: string;
    noSponsors: string;
    noEligibleAgreements: string;
    ineligibleSuffix: string;
    allocation: string;
    allocationHint: string;
    detailWindow: string;
    detailPricing: string;
    detailCurrency: string;
    detailAvailable: string;
    detailStatus: string;
    unlimited: string;
    editNote: string;
  };
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

/** Sponsorluk-özel hata kodlarını (ör. anlaşma aktivasyon guard'ı) önce Türkçeleştirir. */
function campaignError(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
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

  // TODO-161A.2 — ticari mod + sponsor/anlaşma bağlama (yalnız create'te bağlanır).
  const [commercialMode, setCommercialMode] = useState<SponsoredCommercialMode>(
    editing?.commercialMode ?? "INTERNAL_PROMOTION",
  );
  const [sponsors, setSponsors] = useState<SponsorAccountSummary[]>([]);
  const [sponsorId, setSponsorId] = useState("");
  const [eligibleAgreements, setEligibleAgreements] = useState<SponsorshipEligibleAgreement[]>([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [agreementId, setAgreementId] = useState("");
  const [allocationInput, setAllocationInput] = useState("");

  const c = labels.commercial;
  // Anlaşma bağlama akışı yalnız create'te (update sözleşmesi agreementId kabul etmez).
  const showAgreementLinker = !editing && commercialMode === "SPONSORED";

  // SPONSORED + create seçilince sponsor listesini bir kez yükle.
  useEffect(() => {
    if (!showAgreementLinker || sponsors.length > 0) return;
    storeApi
      .listSponsors({ status: "ACTIVE", pageSize: 100 })
      .then((r) => setSponsors(r.data))
      .catch(() => {});
  }, [showAgreementLinker, sponsors.length]);

  // Sponsor seçilince o sponsora ait uygun anlaşmaları yükle.
  useEffect(() => {
    if (!sponsorId) {
      setEligibleAgreements([]);
      setAgreementId("");
      return;
    }
    let cancelled = false;
    setLoadingAgreements(true);
    storeApi
      .listEligibleAgreements(sponsorId)
      .then((r) => {
        if (!cancelled) setEligibleAgreements(r.data);
      })
      .catch(() => {
        if (!cancelled) setEligibleAgreements([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgreements(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sponsorId]);

  const selectedAgreement = eligibleAgreements.find((a) => a.id === agreementId) ?? null;

  const parsedKeywords = useMemo(
    () =>
      keywordsText
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  // placement create'te seçilir + sonrasında IMMUTABLE; edit'te mevcut kampanyanınki geçerlidir.
  const effectivePlacement = editing ? editing.placement : placement;
  // Hedefleme (keyword + kategori) YALNIZ SEARCH_RESULTS için anlamlı (ADR-116); HOME_SHOWCASE'te YOK SAYILIR.
  const showTargeting = effectivePlacement === "SEARCH_RESULTS";

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
        // HOME_SHOWCASE'te hedefleme gönderilmez (temiz veri; kafa karışıklığı yok).
        targetCategoryId: showTargeting ? categoryIds[0] ?? null : null,
        productIds,
        keywords: showTargeting ? parsedKeywords : [],
        // Ticari mod her iki akışta da gönderilir (server-otoriter; verilmezse INTERNAL_PROMOTION).
        commercialMode,
      };
      if (editing) {
        const payload: SponsoredCampaignUpdateRequest = shared;
        const res = await storeApi.updateSponsoredCampaign(editing.id, payload);
        onSaved(res.data.id);
      } else {
        // SPONSORED create'te seçili anlaşma + opsiyonel ayrılan tutar bağlanır (nihai doğrulama sunucuda).
        const allocationMinor = commercialMode === "SPONSORED" ? inputToMinor(allocationInput) : null;
        const payload: SponsoredCampaignCreateRequest = {
          ...shared,
          placement,
          ...(commercialMode === "SPONSORED" && agreementId
            ? { agreementId, allocationAmountMinor: allocationMinor ?? undefined }
            : {}),
        };
        const res = await storeApi.createSponsoredCampaign(payload);
        onSaved(res.data.id);
      }
    } catch (cause) {
      setError(campaignError(cause, locale));
    } finally {
      // Başarı (edit) sonrası form açık kalır → buton "Kaydediliyor..."te TAKILMAMASI için busy sıfırlanır.
      // Create'te onSaved navigasyonu unmount ettiğinden bu no-op (React 18 güvenli).
      setBusy(false);
    }
  };

  const showKeywords = showTargeting;

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div>
        <Input label={labels.name} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        {nameError ? <p className="mt-1 text-xs text-rose-300">{nameError}</p> : null}
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <Select
          label={c.mode}
          value={commercialMode}
          onChange={(e) => setCommercialMode(e.target.value as SponsoredCommercialMode)}
          disabled={busy}
          options={[
            { value: "INTERNAL_PROMOTION", label: c.internal },
            { value: "SPONSORED", label: c.sponsored },
          ]}
        />
        <p className="mt-1 text-xs text-white/40">{c.modeHint}</p>

        {showAgreementLinker ? (
          <div className="mt-3 space-y-3">
            <Select
              label={c.sponsor}
              value={sponsorId}
              onChange={(e) => setSponsorId(e.target.value)}
              disabled={busy}
              options={[
                { value: "", label: sponsors.length === 0 ? c.noSponsors : c.sponsorPlaceholder },
                ...sponsors.map((s) => ({ value: s.id, label: s.companyName })),
              ]}
            />

            {sponsorId ? (
              <Select
                label={c.agreement}
                value={agreementId}
                onChange={(e) => setAgreementId(e.target.value)}
                disabled={busy || loadingAgreements}
                options={[
                  {
                    value: "",
                    label: loadingAgreements
                      ? c.agreementLoading
                      : eligibleAgreements.length === 0
                        ? c.noEligibleAgreements
                        : c.agreementPlaceholder,
                  },
                  ...eligibleAgreements.map((a) => ({
                    value: a.id,
                    label: a.commerciallyEligible
                      ? `${a.agreementNumber} · ${a.title}`
                      : `${a.agreementNumber} · ${a.title} — ${c.ineligibleSuffix}`,
                  })),
                ]}
              />
            ) : null}

            {selectedAgreement ? (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-xs text-white/60">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <span>
                    <span className="text-white/40">{c.detailWindow}: </span>
                    {formatDate(selectedAgreement.startsAt)} – {formatDate(selectedAgreement.endsAt)}
                  </span>
                  <span>
                    <span className="text-white/40">{c.detailPricing}: </span>
                    {PRICING_MODEL_LABELS[selectedAgreement.pricingModel]}
                  </span>
                  <span>
                    <span className="text-white/40">{c.detailCurrency}: </span>
                    {selectedAgreement.currency}
                  </span>
                  <span>
                    <span className="text-white/40">{c.detailAvailable}: </span>
                    {selectedAgreement.availableAllocationMinor === null
                      ? c.unlimited
                      : formatMinor(selectedAgreement.availableAllocationMinor, selectedAgreement.currency)}
                  </span>
                  <span>
                    <span className="text-white/40">{c.detailStatus}: </span>
                    {AGREEMENT_STATUS_LABELS[selectedAgreement.status]}
                  </span>
                </div>
                {!selectedAgreement.commerciallyEligible ? (
                  <p className="mt-1.5 text-amber-300">
                    {selectedAgreement.ineligibilityReason
                      ? INELIGIBILITY_LABELS[selectedAgreement.ineligibilityReason] ??
                        selectedAgreement.ineligibilityReason
                      : c.ineligibleSuffix}
                  </p>
                ) : null}
                <div className="mt-2">
                  <Input
                    label={c.allocation}
                    inputMode="decimal"
                    value={allocationInput}
                    onChange={(e) => setAllocationInput(e.target.value)}
                    disabled={busy}
                  />
                  <p className="mt-1 text-xs text-white/40">{c.allocationHint}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {editing && commercialMode === "SPONSORED" ? (
          <p className="mt-3 text-xs text-white/40">{c.editNote}</p>
        ) : null}
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

      {showTargeting ? (
        <>
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
        </>
      ) : null}

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
