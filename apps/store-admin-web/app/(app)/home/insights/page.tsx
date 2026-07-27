"use client";

/**
 * TD-130 (ADR-145…148) — Recommendation Measurement görünürlük özeti (küçük funnel; büyük raporlama YOK).
 *
 * Öneri yüzeylerinin (Son İncelediklerin / Benzer Ürünler) impression/click/add-to-cart + CTR'ını gösterir;
 * source ve placement kırılımı + tarih aralığı / source / placement filtreleri. Salt-okunur; platform-admin.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DataTable,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import type { RecommendationSummaryResponse } from "@commerce-os/api-client";
import { HomeIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";

type Locale = "tr" | "en";
type SummaryData = RecommendationSummaryResponse["data"];
type Bucket = SummaryData["bySource"][number];

const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "180": 180 };

function labels(locale: Locale) {
  const tr = {
    eyebrow: "Ana Sayfa Deneyimi",
    title: "Öneri Ölçümü",
    description:
      "Son İncelediklerin ve Benzer Ürünler yüzeylerinin gösterim, tıklama, sepete ekleme ve CTR değerleri.",
    back: "← Bölümlere dön",
    rangeLabel: "Tarih aralığı",
    ranges: { "7": "Son 7 gün", "30": "Son 30 gün", "90": "Son 90 gün", "180": "Son 180 gün" } as Record<string, string>,
    sourceLabel: "Kaynak",
    placementLabel: "Yerleşim",
    all: "Tümü",
    sources: { RECENTLY_VIEWED: "Son İncelediklerin", SIMILAR_PRODUCTS: "Benzer Ürünler" } as Record<string, string>,
    placements: { HOME: "Ana Sayfa", PDP: "Ürün Detay", CART: "Sepet", ACCOUNT: "Hesabım" } as Record<string, string>,
    totals: "Toplamlar",
    impressions: "Gösterim",
    clicks: "Tıklama",
    addToCart: "Sepete Ekleme",
    ctr: "CTR",
    bySource: "Kaynağa göre",
    byPlacement: "Yerleşime göre",
    key: "Ad",
    loadError: "Özet yüklenemedi.",
    retry: "Tekrar dene",
    empty: "Bu aralıkta öneri event'i yok.",
  };
  const en: typeof tr = {
    eyebrow: "Home Experience",
    title: "Recommendation Insights",
    description:
      "Impressions, clicks, add-to-cart and CTR for the Recently Viewed and Similar Products surfaces.",
    back: "← Back to sections",
    rangeLabel: "Date range",
    ranges: { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "180": "Last 180 days" },
    sourceLabel: "Source",
    placementLabel: "Placement",
    all: "All",
    sources: { RECENTLY_VIEWED: "Recently Viewed", SIMILAR_PRODUCTS: "Similar Products" },
    placements: { HOME: "Home", PDP: "Product", CART: "Cart", ACCOUNT: "Account" },
    totals: "Totals",
    impressions: "Impressions",
    clicks: "Clicks",
    addToCart: "Add to cart",
    ctr: "CTR",
    bySource: "By source",
    byPlacement: "By placement",
    key: "Name",
    loadError: "Could not load summary.",
    retry: "Retry",
    empty: "No recommendation events in this range.",
  };
  return locale === "en" ? en : tr;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default function RecommendationInsightsPage() {
  const locale = useLocale() as Locale;
  const t = labels(locale);
  const router = useRouter();

  const [rangeKey, setRangeKey] = useState("30");
  const [source, setSource] = useState("");
  const [placement, setPlacement] = useState("");
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: SummaryData }
  >({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.getRecommendationSummary({
        from: isoDaysAgo(RANGE_DAYS[rangeKey] ?? 30),
        source: source || undefined,
        placement: placement || undefined,
      });
      setState({ status: "ready", data: result.data });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [rangeKey, source, placement, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const bucketColumns = useMemo<DataTableColumn<Bucket>[]>(
    () => [
      { header: t.key, cell: (b) => <span className="font-medium text-white/90">{b.key}</span> },
      { header: t.impressions, align: "right", cell: (b) => <span className="text-white/70">{b.impressions}</span> },
      { header: t.clicks, align: "right", cell: (b) => <span className="text-white/70">{b.clicks}</span> },
      { header: t.addToCart, align: "right", cell: (b) => <span className="text-white/70">{b.addToCart}</span> },
      { header: t.ctr, align: "right", cell: (b) => <span className="text-white/70">{pct(b.ctr)}</span> },
    ],
    [t],
  );

  const labelBucket = (bucket: Bucket, map: Record<string, string>): Bucket => ({ ...bucket, key: map[bucket.key] ?? bucket.key });

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Button variant="secondary" onClick={() => router.push("/home")}>
            {t.back}
          </Button>
        }
      />

      <SectionCard title={t.title} icon={<HomeIcon />}>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            id="rec-range"
            label={t.rangeLabel}
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            options={Object.keys(RANGE_DAYS).map((value) => ({ value, label: t.ranges[value] }))}
          />
          <Select
            id="rec-source"
            label={t.sourceLabel}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            options={[
              { value: "", label: t.all },
              { value: "RECENTLY_VIEWED", label: t.sources.RECENTLY_VIEWED },
              { value: "SIMILAR_PRODUCTS", label: t.sources.SIMILAR_PRODUCTS },
            ]}
          />
          <Select
            id="rec-placement"
            label={t.placementLabel}
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            options={[
              { value: "", label: t.all },
              { value: "HOME", label: t.placements.HOME },
              { value: "PDP", label: t.placements.PDP },
              { value: "CART", label: t.placements.CART },
              { value: "ACCOUNT", label: t.placements.ACCOUNT },
            ]}
          />
        </div>

        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}
        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {t.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" ? (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label={t.impressions} value={state.data.totals.impressions} />
              <Metric label={t.clicks} value={state.data.totals.clicks} />
              <Metric label={t.addToCart} value={state.data.totals.addToCart} />
              <Metric label={t.ctr} value={pct(state.data.totals.ctr)} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white/80">{t.bySource}</h3>
              <DataTable
                columns={bucketColumns}
                rows={state.data.bySource.map((b) => labelBucket(b, t.sources))}
                rowKey={(b) => b.key}
                caption={t.bySource}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white/80">{t.byPlacement}</h3>
              <DataTable
                columns={bucketColumns}
                rows={state.data.byPlacement.map((b) => labelBucket(b, t.placements))}
                rowKey={(b) => b.key}
                caption={t.byPlacement}
              />
            </div>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white/90">{value}</p>
    </div>
  );
}
