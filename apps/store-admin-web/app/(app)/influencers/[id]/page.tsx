"use client";

/**
 * TODO-160 — Influencer detayı. Kimlik başlığı + düzenle; influencer kampanyaları
 * (oluştur), izleme linkleri (kopyala + durum aç/kapa + oluştur) ve influencer'a
 * özel atıf KPI şeridi. Para minor birimdedir; oran 0..1 → yüzde.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../../components/ui";
import type {
  InfluencerDetail,
  InfluencerStatus,
  InfluencerCampaignSummary,
  InfluencerCampaignStatus,
  InfluencerCampaignCreateRequest,
  TrackingLinkSummary,
  TrackingLinkTargetType,
  TrackingLinkCreateRequest,
  AttributionKpiSummary,
} from "@commerce-os/api-client";
import {
  EntitySelectorField,
  useCategorySelectorBinding,
  useProductSelectorBinding,
} from "../../../../components/selector";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { DetailHero, SurfaceCard } from "../../../components/premium";
import { InfluencerFormModal } from "../influencer-form";
import { AttributionMetrics, type AttributionLabels } from "../attribution";

type Locale = "tr" | "en";
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONES: Record<InfluencerStatus, Tone> = { ACTIVE: "success", INACTIVE: "neutral" };
const CAMPAIGN_TONES: Record<InfluencerCampaignStatus, Tone> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
};
const CAMPAIGN_STATUSES: readonly InfluencerCampaignStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];
const TARGET_TYPES: readonly TrackingLinkTargetType[] = ["HOME", "PRODUCT", "CATEGORY", "PATH"];

const L = {
  tr: {
    back: "Influencer'lar",
    eyebrow: "Influencer",
    edit: "Düzenle",
    loadError: "Influencer yüklenemedi.",
    statusLabels: { ACTIVE: "Aktif", INACTIVE: "Pasif" } as Record<InfluencerStatus, string>,
    notesTitle: "Notlar",
    // Kampanyalar
    campaignsTitle: "Influencer kampanyaları",
    campaignsDescription: "Bu influencer'a bağlı kampanyalar ve atıf pencereleri.",
    newCampaign: "Yeni kampanya",
    campaignsEmpty: "Henüz kampanya yok.",
    campaignName: "Kampanya adı",
    campaignStatus: "Durum",
    campaignWindow: "Atıf penceresi (gün)",
    campaignStarts: "Başlangıç (opsiyonel)",
    campaignEnds: "Bitiş (opsiyonel)",
    campaignLinks: "link",
    campaignStatusLabels: {
      ACTIVE: "Aktif",
      PAUSED: "Duraklatıldı",
      ARCHIVED: "Arşivlendi",
    } as Record<InfluencerCampaignStatus, string>,
    // Linkler
    linksTitle: "İzleme linkleri",
    linksDescription: "Tıklama ve atıflı sipariş sayıları. Link URL'si güvenlik için yalnız oluşturma/yenileme anında gösterilir.",
    newLink: "Yeni link",
    linksEmpty: "Henüz izleme linki yok.",
    linksNeedCampaign: "Önce bir kampanya oluşturun.",
    copy: "Kopyala",
    copied: "Kopyalandı",
    regenerate: "Yeni link üret",
    oneTimeUrlTitle: "İzleme linki hazır",
    oneTimeUrlWarning:
      "Bu URL yalnız ŞİMDİ gösterilir ve tekrar görüntülenemez. Şimdi kopyalayın; kaybederseniz 'Yeni link üret' ile yenileyin (eski link geçersizlenir).",
    activate: "Etkinleştir",
    deactivate: "Durdur",
    clicks: "tıklama",
    orders: "atıflı sipariş",
    linkCampaign: "Kampanya",
    linkTargetType: "Hedef tipi",
    linkProduct: "Ürün",
    linkCategory: "Kategori",
    linkPath: "Hedef yol",
    linkPathPlaceholder: "/kampanya/yaz-indirimi",
    utmSource: "UTM Source (opsiyonel)",
    utmMedium: "UTM Medium (opsiyonel)",
    utmCampaign: "UTM Campaign (opsiyonel)",
    targetTypeLabels: {
      HOME: "Ana sayfa",
      PRODUCT: "Ürün",
      CATEGORY: "Kategori",
      PATH: "Serbest yol",
    } as Record<TrackingLinkTargetType, string>,
    linkStatusLabels: { ACTIVE: "Aktif", INACTIVE: "Pasif" } as Record<string, string>,
    // Analitik
    metricsTitle: "Atıf özeti",
    metricsDescription: "Bu influencer'ın tüm zamanlar performansı.",
    save: "Kaydet",
    create: "Oluştur",
    close: "Kapat",
    metrics: {
      totalClicks: "Toplam tıklama",
      uniqueVisitors: "Tekil ziyaretçi",
      attributedOrders: "Atıflı sipariş",
      conversionRate: "Dönüşüm oranı",
      grossRevenue: "Brüt ciro",
      netRevenue: "Net ciro",
    } satisfies AttributionLabels,
  },
  en: {
    back: "Influencers",
    eyebrow: "Influencer",
    edit: "Edit",
    loadError: "Could not load influencer.",
    statusLabels: { ACTIVE: "Active", INACTIVE: "Inactive" } as Record<InfluencerStatus, string>,
    notesTitle: "Notes",
    campaignsTitle: "Influencer campaigns",
    campaignsDescription: "Campaigns linked to this influencer and their attribution windows.",
    newCampaign: "New campaign",
    campaignsEmpty: "No campaigns yet.",
    campaignName: "Campaign name",
    campaignStatus: "Status",
    campaignWindow: "Attribution window (days)",
    campaignStarts: "Starts at (optional)",
    campaignEnds: "Ends at (optional)",
    campaignLinks: "links",
    campaignStatusLabels: {
      ACTIVE: "Active",
      PAUSED: "Paused",
      ARCHIVED: "Archived",
    } as Record<InfluencerCampaignStatus, string>,
    linksTitle: "Tracking links",
    linksDescription: "Click and attributed-order counts. For security the link URL is shown only when created or regenerated.",
    newLink: "New link",
    linksEmpty: "No tracking links yet.",
    linksNeedCampaign: "Create a campaign first.",
    copy: "Copy",
    copied: "Copied",
    regenerate: "Regenerate link",
    oneTimeUrlTitle: "Tracking link ready",
    oneTimeUrlWarning:
      "This URL is shown only NOW and cannot be viewed again. Copy it now; if you lose it, use 'Regenerate link' (the old link is invalidated).",
    activate: "Activate",
    deactivate: "Deactivate",
    clicks: "clicks",
    orders: "attributed orders",
    linkCampaign: "Campaign",
    linkTargetType: "Target type",
    linkProduct: "Product",
    linkCategory: "Category",
    linkPath: "Target path",
    linkPathPlaceholder: "/campaign/summer-sale",
    utmSource: "UTM Source (optional)",
    utmMedium: "UTM Medium (optional)",
    utmCampaign: "UTM Campaign (optional)",
    targetTypeLabels: {
      HOME: "Home",
      PRODUCT: "Product",
      CATEGORY: "Category",
      PATH: "Custom path",
    } as Record<TrackingLinkTargetType, string>,
    linkStatusLabels: { ACTIVE: "Active", INACTIVE: "Inactive" } as Record<string, string>,
    metricsTitle: "Attribution summary",
    metricsDescription: "All-time performance for this influencer.",
    save: "Save",
    create: "Create",
    close: "Close",
    metrics: {
      totalClicks: "Total clicks",
      uniqueVisitors: "Unique visitors",
      attributedOrders: "Attributed orders",
      conversionRate: "Conversion rate",
      grossRevenue: "Gross revenue",
      netRevenue: "Net revenue",
    } satisfies AttributionLabels,
  },
} satisfies Record<Locale, unknown>;

/** date input (YYYY-MM-DD) → ISO datetime; boş ise null. */
function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function InfluencerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;

  const [detail, setDetail] = useState<InfluencerDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await storeApi.getInfluencer(id);
      setDetail(result.data);
    } catch (error) {
      setLoadError(messageForError(error, locale));
    }
  }, [id, locale]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{loadError}</Alert>
      </div>
    );
  }

  if (!detail) {
    return <SkeletonRows rows={6} />;
  }

  return (
    <div className="space-y-5">
      <DetailHero
        backHref="/influencers"
        backLabel={t.back}
        eyebrow={t.eyebrow}
        title={detail.name}
        subtitle={
          <span className="font-mono">
            {detail.code}
            {detail.email ? ` · ${detail.email}` : ""}
          </span>
        }
        badges={<Badge tone={STATUS_TONES[detail.status]}>{t.statusLabels[detail.status]}</Badge>}
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t.edit}
          </Button>
        }
      />

      {editing ? (
        <InfluencerFormModal
          editing={detail}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setDetail(updated);
            setEditing(false);
          }}
        />
      ) : null}

      {detail.notes ? (
        <SurfaceCard title={t.notesTitle}>
          <p className="whitespace-pre-wrap text-sm text-white/70">{detail.notes}</p>
        </SurfaceCard>
      ) : null}

      <InfluencerAnalyticsCard influencerId={id} t={t} locale={locale} />

      <CampaignsSection influencerId={id} t={t} locale={locale} />

      <TrackingLinksSection influencerId={id} t={t} locale={locale} />
    </div>
  );
}

/* ── Influencer'a özel atıf özeti ───────────────────────────────────────────── */
function InfluencerAnalyticsCard({
  influencerId,
  t,
  locale,
}: {
  influencerId: string;
  t: (typeof L)[Locale];
  locale: Locale;
}) {
  const [summary, setSummary] = useState<AttributionKpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await storeApi.getInfluencerAnalytics({ influencerId });
        if (alive) setSummary(result.data.summary);
      } catch (cause) {
        if (alive) setError(messageForError(cause, locale));
      }
    })();
    return () => {
      alive = false;
    };
  }, [influencerId, locale]);

  return (
    <SurfaceCard title={t.metricsTitle} description={t.metricsDescription}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {summary ? (
        <AttributionMetrics summary={summary} labels={t.metrics} locale={locale} />
      ) : !error ? (
        <SkeletonRows rows={2} />
      ) : null}
    </SurfaceCard>
  );
}

/* ── Kampanyalar ────────────────────────────────────────────────────────────── */
function CampaignsSection({
  influencerId,
  t,
  locale,
}: {
  influencerId: string;
  t: (typeof L)[Locale];
  locale: Locale;
}) {
  const [campaigns, setCampaigns] = useState<InfluencerCampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await storeApi.listInfluencerCampaigns({ influencerId });
      setCampaigns(result.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
      setCampaigns([]);
    }
  }, [influencerId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SurfaceCard
      title={t.campaignsTitle}
      description={t.campaignsDescription}
      actions={<Button onClick={() => setFormOpen(true)}>{t.newCampaign}</Button>}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      {formOpen ? (
        <CampaignFormModal
          influencerId={influencerId}
          t={t}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void load();
          }}
        />
      ) : null}

      {campaigns === null ? (
        <SkeletonRows rows={3} />
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-white/50">{t.campaignsEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white/90">{campaign.name}</p>
                <p className="text-xs text-white/45">
                  {t.campaignWindow}: {campaign.attributionWindowDays} · {campaign.linkCount}{" "}
                  {t.campaignLinks}
                  {campaign.startsAt ? ` · ${formatDate(campaign.startsAt)}` : ""}
                  {campaign.endsAt ? ` → ${formatDate(campaign.endsAt)}` : ""}
                </p>
              </div>
              <Badge tone={CAMPAIGN_TONES[campaign.status]}>
                {t.campaignStatusLabels[campaign.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

function CampaignFormModal({
  influencerId,
  t,
  locale,
  onClose,
  onSaved,
}: {
  influencerId: string;
  t: (typeof L)[Locale];
  locale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<InfluencerCampaignStatus>("ACTIVE");
  const [windowDays, setWindowDays] = useState("30");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload: InfluencerCampaignCreateRequest = {
        influencerId,
        name: name.trim(),
        status,
        attributionWindowDays: Number.parseInt(windowDays, 10) || 30,
        startsAt: dateInputToIso(startsAt),
        endsAt: dateInputToIso(endsAt),
      };
      await storeApi.createInfluencerCampaign(payload);
      onSaved();
    } catch (cause) {
      setError(messageForError(cause, locale));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.newCampaign}
      closeLabel={t.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.close}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {t.create}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input label={t.campaignName} value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t.campaignWindow}
            type="number"
            inputMode="numeric"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
          />
          <Select
            label={t.campaignStatus}
            value={status}
            onChange={(e) => setStatus(e.target.value as InfluencerCampaignStatus)}
            options={CAMPAIGN_STATUSES.map((value) => ({
              value,
              label: t.campaignStatusLabels[value],
            }))}
          />
          <Input
            label={t.campaignStarts}
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label={t.campaignEnds}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}

/* ── İzleme linkleri ────────────────────────────────────────────────────────── */
function TrackingLinksSection({
  influencerId,
  t,
  locale,
}: {
  influencerId: string;
  t: (typeof L)[Locale];
  locale: Locale;
}) {
  const [links, setLinks] = useState<TrackingLinkSummary[] | null>(null);
  const [campaigns, setCampaigns] = useState<InfluencerCampaignSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Tek-seferlik plain URL (oluşturma/yenileme sonrası; bir daha gösterilmez).
  const [oneTimeUrl, setOneTimeUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [linkResult, campaignResult] = await Promise.all([
        storeApi.listTrackingLinks({ influencerId }),
        storeApi.listInfluencerCampaigns({ influencerId }),
      ]);
      setLinks(linkResult.data);
      setCampaigns(campaignResult.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
      setLinks([]);
    }
  }, [influencerId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  // Yenileme (rotation): yeni token üretir, eskisini geçersiz kılar; tek-seferlik url döner.
  const regenerate = async (link: TrackingLinkSummary) => {
    setBusyId(link.id);
    setError(null);
    try {
      const res = await storeApi.regenerateTrackingLink(link.id);
      setOneTimeUrl(res.data.url);
      await load();
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (link: TrackingLinkSummary) => {
    setBusyId(link.id);
    setError(null);
    try {
      await storeApi.updateTrackingLink(link.id, {
        status: link.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      await load();
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SurfaceCard
      title={t.linksTitle}
      description={t.linksDescription}
      actions={
        <Button onClick={() => setFormOpen(true)} disabled={campaigns.length === 0}>
          {t.newLink}
        </Button>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {campaigns.length === 0 && links && links.length === 0 ? (
        <p className="mb-3 text-xs text-amber-300/80">{t.linksNeedCampaign}</p>
      ) : null}

      {formOpen ? (
        <LinkFormModal
          campaigns={campaigns}
          t={t}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={(url) => {
            setFormOpen(false);
            setOneTimeUrl(url);
            void load();
          }}
        />
      ) : null}

      {oneTimeUrl ? (
        <OneTimeUrlModal url={oneTimeUrl} t={t} onClose={() => setOneTimeUrl(null)} />
      ) : null}

      {links === null ? (
        <SkeletonRows rows={3} />
      ) : links.length === 0 ? (
        <p className="text-sm text-white/50">{t.linksEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-white/85" title={link.targetPath}>
                    {link.targetPath}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {link.campaignName} · {t.targetTypeLabels[link.targetType]}
                    {link.productTitle ? ` · ${link.productTitle}` : ""}
                    {link.categoryTitle ? ` · ${link.categoryTitle}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    <span className="tabular-nums text-white/70">{link.totalClicks}</span> {t.clicks}{" "}
                    · <span className="tabular-nums text-white/70">{link.attributedOrders}</span>{" "}
                    {t.orders}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={link.status === "ACTIVE" ? "success" : "neutral"}>
                    {t.linkStatusLabels[link.status]}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === link.id}
                    onClick={() => void regenerate(link)}
                  >
                    {t.regenerate}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === link.id}
                    onClick={() => void toggleStatus(link)}
                  >
                    {link.status === "ACTIVE" ? t.deactivate : t.activate}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  );
}

// Tek-seferlik plain URL: yalnız oluşturma/yenileme sonrası; kapatınca bir daha gösterilmez.
function OneTimeUrlModal({ url, t, onClose }: { url: string; t: (typeof L)[Locale]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Pano erişimi reddedildiyse sessiz geç.
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t.oneTimeUrlTitle}
      closeLabel={t.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.close}
          </Button>
          <Button onClick={() => void copy()}>{copied ? t.copied : t.copy}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Alert tone="warning">{t.oneTimeUrlWarning}</Alert>
        <p className="break-all rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 font-mono text-sm text-white/85">
          {url}
        </p>
      </div>
    </Modal>
  );
}

function LinkFormModal({
  campaigns,
  t,
  locale,
  onClose,
  onSaved,
}: {
  campaigns: InfluencerCampaignSummary[];
  t: (typeof L)[Locale];
  locale: Locale;
  onClose: () => void;
  onSaved: (oneTimeUrl: string) => void;
}) {
  const productSelector = useProductSelectorBinding(locale);
  const categorySelector = useCategorySelectorBinding(locale);
  const toMessage = useCallback((error: unknown) => messageForError(error, locale), [locale]);

  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [targetType, setTargetType] = useState<TrackingLinkTargetType>("HOME");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [targetPath, setTargetPath] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!campaignId) return;
    setBusy(true);
    setError(null);
    try {
      const payload: TrackingLinkCreateRequest = {
        campaignId,
        targetType,
        productId: targetType === "PRODUCT" ? productIds[0] ?? null : null,
        categoryId: targetType === "CATEGORY" ? categoryIds[0] ?? null : null,
        targetPath: targetType === "PATH" ? (targetPath.trim() ? targetPath.trim() : null) : null,
        utmSource: utmSource.trim() ? utmSource.trim() : null,
        utmMedium: utmMedium.trim() ? utmMedium.trim() : null,
        utmCampaign: utmCampaign.trim() ? utmCampaign.trim() : null,
      };
      const res = await storeApi.createTrackingLink(payload);
      onSaved(res.data.url);
    } catch (cause) {
      setError(messageForError(cause, locale));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.newLink}
      closeLabel={t.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.close}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !campaignId}>
            {t.create}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label={t.linkCampaign}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            options={campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))}
          />
          <Select
            label={t.linkTargetType}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TrackingLinkTargetType)}
            options={TARGET_TYPES.map((value) => ({ value, label: t.targetTypeLabels[value] }))}
          />
        </div>

        {targetType === "PRODUCT" ? (
          <EntitySelectorField
            label={t.linkProduct}
            multiple={false}
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
        ) : null}

        {targetType === "CATEGORY" ? (
          <EntitySelectorField
            label={t.linkCategory}
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
        ) : null}

        {targetType === "PATH" ? (
          <Input
            label={t.linkPath}
            value={targetPath}
            placeholder={t.linkPathPlaceholder}
            onChange={(e) => setTargetPath(e.target.value)}
          />
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Input label={t.utmSource} value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
          <Input label={t.utmMedium} value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
          <Input
            label={t.utmCampaign}
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
