"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import {
  estimateAutomaticUnitFinalMinor,
  fashionAxisSelectionForVariant,
  fashionVariantIdForSelection,
  maxPurchasableQuantity,
  type StorefrontCampaignView,
  type StorefrontFashionView,
  type StorefrontProductDetail,
  type StorefrontVariantView,
} from "../lib/catalog-types";
import { ctaLabel, primaryPriceText, showsNumericPrice } from "../lib/labels";
import { formatMinor, resolveUnitPriceLabels } from "../lib/money";
import { addToCartAction, claimCouponAction } from "../lib/server/cart-actions";
import { consumeRecommendationAttribution, trackRecommendationEvent } from "../lib/recommendation/track";
import { trackDiscoveryAddToCart } from "../lib/discovery/track";
import { usePdpSelection } from "./pdp-selection";
import { SizeChartModal } from "./size-chart-modal";
import { WishlistHeartButton } from "./wishlist/wishlist-heart-button";
import { Badge, Button, type BadgeTone } from "./ui";

const LOW_STOCK = 5;

// NOTR tonlar (DS): rozet aksan taşımaz. Stok DURUMU metinle net; tükendi/az kalan
// dolu "ink" ile dikkat çeker, stokta/bilinmeyen sessiz kalır.
function stockLabel(
  variant: StorefrontVariantView | undefined,
  t: StorefrontDictionary["detail"],
): { text: string; tone: BadgeTone } {
  if (!variant || variant.available === null) return { text: t.stockUnknown, tone: "muted" };
  if (variant.available <= 0) return { text: t.stockOut, tone: "ink" };
  if (variant.available <= LOW_STOCK) return { text: t.stockLow, tone: "ink" };
  return { text: t.stockIn, tone: "outline" };
}

/**
 * Satin alma karar paneli (buy box). Varyant secimi ve (yalniz ONLINE) adet
 * secimi yereldir; gercek sepet/odeme YOKTUR (F3B). CTA, satis-modeline gore
 * degisir: ONLINE'da sepete ekle/hemen al kontrollu sekilde /cart'a yonlendirir,
 * diger modlarda ilgili iletisim CTA'si gosterilir. Fiyat gizli/talep modunda
 * numerik fiyat gosterilmez.
 */
export function BuyBox({ detail, t }: { detail: StorefrontProductDetail; t: StorefrontDictionary }) {
  const { commerce, variants, price } = detail;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Faz 2C-7 (ADR-078) — secili varyant PAYLASILAN state'ten gelir (VariantGallery ile ortak),
  // boylece varyant secince galeri de reaktif degisir. Varsayilan (en ucuz varyant) provider'da
  // set edilir (page.tsx cheapestVariantId). Adet/added yerel kalir.
  const { selectedVariantId, setSelectedVariantId } = usePdpSelection();
  const selectedId = selectedVariantId;
  const [quantity, setQuantity] = useState(commerce.minQuantity);
  const [added, setAdded] = useState(false);

  // TODO-165 Fashion Vertical — capability-aware moda seçici. `detail.fashion` doluysa (yalnız
  // FASHION_VERTICAL açık + fashion ürün) renk swatch + beden ızgarası render edilir; aksi halde
  // (null / eksensiz) MEVCUT düz varyant-butonu davranışı BİREBİR korunur. Seçim, eksen bazlı
  // harita (attributeDefinitionId → optionId). Başlangıç = varsayılan (en ucuz) varyantın eksen
  // seçimleri → SSR ile aynı ilk state (hidrasyon sıçraması yok); fiyat/stok yine TAM çözülen
  // varyanttan gelir (gateway son otorite). Fashion yoksa hiçbir davranış değişmez.
  const fashion = detail.fashion;
  const fashionMode = !!fashion && fashion.optionAxes.length > 0;
  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const [axisSelection, setAxisSelection] = useState<Record<string, string>>(() =>
    fashionMode ? fashionAxisSelectionForVariant(fashion as StorefrontFashionView, selectedVariantId) : {},
  );
  const [sizeChartOpen, setSizeChartOpen] = useState(false);

  const colorAxis = fashionMode
    ? fashion!.optionAxes.find((axis) => axis.kind === "color") ?? null
    : null;
  // Renk dışı tüm eksenler buton ızgarası (tipik moda ürününde yalnız "beden").
  const gridAxes = fashionMode ? fashion!.optionAxes.filter((axis) => axis.kind !== "color") : [];
  // TAM eksen seçimi → varyant id (eksik/geçersiz kombinasyon → null → fiyat "başlayan"a düşer,
  // ATC kilitli). Başlangıçta seçim tam olduğundan bu değer normalde doludur.
  const resolvedVariantId = fashionMode
    ? fashionVariantIdForSelection(fashion as StorefrontFashionView, axisSelection)
    : null;
  const selectedColorOption = colorAxis
    ? colorAxis.options.find(
        (option) => option.optionId === axisSelection[colorAxis.attributeDefinitionId],
      ) ?? null
    : null;

  // Bir eksen-option'ı, `base` seçimindeki DİĞER (seçili) eksenler sabitken bir varyant üretiyor mu?
  // requireStock=true → yalnız stokta bir varyant sayılır. Seçilmemiş eksen = joker (renk henüz
  // seçilmemişken beden "tüm renkler arası stok var mı" olarak değerlendirilir).
  const optionSatisfiable = (
    axisId: string,
    optionId: string,
    base: Record<string, string>,
    requireStock: boolean,
  ): boolean => {
    if (!fashion) return true;
    const probe = { ...base, [axisId]: optionId };
    return fashion.variantAxisOptions.some((variantAxis) => {
      const matches = fashion.optionAxes.every((axis) => {
        const want = probe[axis.attributeDefinitionId];
        if (!want) return true;
        return variantAxis.axisOptions.some(
          (axisOption) =>
            axisOption.attributeDefinitionId === axis.attributeDefinitionId &&
            axisOption.optionId === want,
        );
      });
      if (!matches) return false;
      if (!requireStock) return true;
      return variantById.get(variantAxis.variantId)?.inStock === true;
    });
  };
  const optionInStock = (axisId: string, optionId: string): boolean =>
    optionSatisfiable(axisId, optionId, axisSelection, true);

  // Renk seçimi: renk değişince, her ızgara ekseninde mevcut seçim bu renkte GEÇERSİZSE en iyi
  // seçeneğe otomatik geç (önce stokta, yoksa var olan ilk kombinasyon). Böylece seçim TAM kalır →
  // galeri + fiyat tutarlı; kullanıcı geçersiz beden-renk kombinasyonunda takılmaz.
  const selectColor = (optionId: string) => {
    if (!colorAxis) return;
    setAdded(false);
    setAxisSelection((prev) => {
      const next = { ...prev, [colorAxis.attributeDefinitionId]: optionId };
      for (const axis of gridAxes) {
        const current = next[axis.attributeDefinitionId];
        // TODO-165: renk değişince mevcut beden bu renkte STOKTA değilse (var olsa bile) en iyi
        // seçeneğe geç. requireStock=true → OOS-ama-var olan kombinasyonda takılıp kalınmaz;
        // seçili beden daima stokta olan bir varyanta çözülür (server yine son güvenlik).
        const currentOk = current
          ? optionSatisfiable(axis.attributeDefinitionId, current, next, true)
          : false;
        if (!currentOk) {
          const inStock = axis.options.find((option) =>
            optionSatisfiable(axis.attributeDefinitionId, option.optionId, next, true),
          );
          const exists = axis.options.find((option) =>
            optionSatisfiable(axis.attributeDefinitionId, option.optionId, next, false),
          );
          const pick = inStock ?? exists;
          if (pick) next[axis.attributeDefinitionId] = pick.optionId;
        }
      }
      return next;
    });
  };
  const selectAxisOption = (axisId: string, optionId: string) => {
    setAdded(false);
    setAxisSelection((prev) => ({ ...prev, [axisId]: optionId }));
  };

  const selected = fashionMode
    ? resolvedVariantId
      ? variantById.get(resolvedVariantId)
      : undefined
    : variants.find((variant) => variant.id === selectedId) ?? variants[0];

  // Fashion modda çözülen varyantı PAYLAŞILAN state'e yansıt (VariantGallery renk grubuna göre
  // reaktif değişsin + adet stok limitine normalize olsun). Başlangıçta resolved === default
  // olduğundan ilk render'da tetiklenmez (hidrasyon güvenli).
  useEffect(() => {
    if (!fashionMode) return;
    if (resolvedVariantId && resolvedVariantId !== selectedVariantId) {
      setSelectedVariantId(resolvedVariantId);
    }
  }, [fashionMode, resolvedVariantId, selectedVariantId, setSelectedVariantId]);
  const numeric = showsNumericPrice(price);
  const stock = stockLabel(selected, t.detail);

  // Satin alinabilir azami adet = magaza max sinir ile (biliniyorsa) varyant stok
  // limitinin kucugu. Stok bilinmiyorsa (available === null) yalniz magaza siniri
  // gecerlidir; server reconcile yine son guvenliktir. Stok 0/yok ise satilamaz.
  const storeMax = commerce.maxQuantity ?? 99;
  const stockLimit = selected?.available ?? null;
  const outOfStock = !!selected && selected.inStock === false;
  const maxQty = maxPurchasableQuantity({
    minQuantity: commerce.minQuantity,
    storeMax: commerce.maxQuantity,
    available: stockLimit,
  });
  const clamp = (value: number) => Math.min(Math.max(value, commerce.minQuantity), maxQty);
  // Stok, magaza sinirindan once devreye giren baglayici kisit mi? (uyari metni icin)
  const stockIsBinding = stockLimit !== null && !outOfStock && stockLimit <= storeMax;
  const atStockLimit = stockIsBinding && quantity >= maxQty;

  // Varyant degisince (veya stok limiti dususe) adet yeni maksimuma normalize edilir.
  // Bagimliliklar bilincli olarak [selectedId, maxQty]; setQuantity sabittir.
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(q, commerce.minQuantity), maxQty));
  }, [selectedId, maxQty, commerce.minQuantity]);

  // BUG-PDP-001 — Buy box'ta gosterilen tutar DAIMA secili varyantin TEK ADET
  // birim fiyatidir; adet (quantity) fiyat GOSTERIMINI ETKILEMEZ. quantity yalniz
  // add-to-cart payload'inda + sunucu-otoriter sepet/checkout/order/payment
  // tutarlarinda uygulanir. Ham minor tutar varsa istemcide bicimlenir; yoksa
  // sunucudan gelen tekil etikete geri dusulur (gizli/talep modunda numeric false).
  const currency = selected?.currency ?? "TRY";
  const unitMinor = selected?.priceMinor ?? null;
  const compareMinor = selected?.compareAtMinor ?? null;
  const { unitLabel: unitPriceLabel, compareLabel: compareUnitLabel } = resolveUnitPriceLabels({
    numeric,
    unitMinor,
    compareMinor,
    currency,
    fallbackUnitLabel: selected?.priceLabel ?? price.amountLabel,
    fallbackCompareLabel: selected?.compareAtLabel ?? price.compareAtLabel ?? null,
  });

  // OTOMATIK kampanya indirimi (AUTOMATIC_CART_DISCOUNT) VE SECILI varyant icin
  // guvenli bir nihai birim fiyat hesaplanabildiyse: fiyat blogunu "uzeri cizili
  // liste fiyati → buyuk indirimli nihai fiyat → %rozet + Kod gerekmez"
  // hiyerarsisiyle sunar. Tahmin SECILI varyantin fiyatindan (motorla ayni
  // formul) turetilir; boylece varyant degisince fiyat REAKTIF ve uzeri-cizili
  // liste fiyatiyla TUTARLI olur (sunucunun urun-seviyesi/en-ucuz varyant
  // `estimatedFinalLabel` degeri ust-varyantta yanlis/donuk kaliyordu). Public
  // kupon (PUBLIC_COUPON) ve tahmin YOKKEN davranis DEGISMEZ — kupon karti /
  // fallback kutu asagidaki DetailCampaign'da kalir.
  const autoEstimate =
    numeric && detail.campaign ? estimateAutomaticUnitFinalMinor(unitMinor, detail.campaign) : null;
  const autoCampaign = autoEstimate ? detail.campaign : null;
  const showAutoPriceBlock = autoCampaign !== null;
  // Kampanyanin nihai birim fiyati (SECILI varyant) ve uzeri cizili "liste" fiyati.
  const autoFinalLabel = autoEstimate ? formatMinor(autoEstimate.finalMinor, currency) : null;
  const unitListLabel = numeric && unitMinor !== null ? formatMinor(unitMinor, currency) : null;

  // ADD_TO_CART: secili varyanti cookie sepete ekler (Server Action) ve SAYFADA
  // KALIR — yonlendirme YOK; nav sayaci revalidate ile guncellenir, inline bir
  // "sepete eklendi" geri bildirimi gosterilir. BUY_NOW (Simdi Al): sepete ekleyip
  // checkout'a yonlendirir. Adet/varyant istemci state'idir; fiyat/stok/uygunluk
  // gateway tarafinda yeniden dogrulanir.
  // TODO-165 — Fashion modda TAM eksen seçimi (renk + beden) çözülmeden ATC kilitli. Fashion
  // dışında koşul aynen korunur (fashionSelectionComplete=true). `!!selected` fashion modda zaten
  // resolvedVariantId gerektirir; açıklık için ayrı bayrak tutulur.
  const fashionSelectionComplete = !fashionMode || resolvedVariantId !== null;
  const canAddToCart =
    commerce.primaryCta === "ADD_TO_CART" &&
    !commerce.primaryCtaDisabled &&
    !!selected &&
    !outOfStock &&
    fashionSelectionComplete;

  // TODO-165 — Az stok göstergesi: seçili varyant stoğu bilinir ve 1–5 arası ise "Son N adet".
  const lowStock =
    !!selected &&
    selected.available !== null &&
    selected.available > 0 &&
    selected.available <= LOW_STOCK;

  // TD-130 — Öneri kaynaklı add-to-cart ölçümü: BAŞARILI sepete-ekleme sonrası, kullanıcı bu PDP'ye bir
  // öneri kartından geldiyse (son-öneri-tıklama attribution bağlamı tazeyse) ADD_TO_CART event'i yazılır.
  // Bağlam TÜKETİLİR (tek sefer); dedupeKey = clickId → aynı dönüşüm iki kez sayılmaz. Bağlam yoksa NO-OP.
  function trackRecommendedAddToCart() {
    const attribution = consumeRecommendationAttribution(detail.id);
    if (attribution) {
      trackRecommendationEvent("ADD_TO_CART", attribution, detail.id, `atc:${attribution.clickId}`);
    }
  }

  // TODO-162 — Keşif kaynaklı add-to-cart ölçümü: kullanıcı bu PDP'ye bir keşif kartından geldiyse (son-keşif-
  // tıklama bağlamı tazeyse) ADD_TO_CART discovery event'i yazılır. Recommendation ölçümünden AYRI/simetrik
  // (çift sayım yok; farklı sessionStorage anahtarı). Bağlam yoksa NO-OP. BAŞARILI sepete-eklemeden sonra çağrılır.
  function trackDiscoveryOriginAddToCart() {
    trackDiscoveryAddToCart(detail.id);
  }

  function addToCart() {
    if (!selected) return;
    startTransition(async () => {
      await addToCartAction(selected.id, quantity);
      setAdded(true);
      trackRecommendedAddToCart();
      trackDiscoveryOriginAddToCart();
    });
  }

  function buyNow() {
    if (!selected) return;
    startTransition(async () => {
      await addToCartAction(selected.id, quantity);
      trackRecommendedAddToCart();
      trackDiscoveryOriginAddToCart();
      router.push("/checkout");
    });
  }

  return (
    <div className="border border-line bg-surface p-6">
      {/* Fiyat blogu. Otomatik kampanya + guvenli tahmin varsa: uzeri cizili
          liste fiyati (kucuk, notr) → buyuk indirimli nihai fiyat → %rozet;
          aksi halde standart tutar (adet x birim, varsa compareAt cizili). */}
      {showAutoPriceBlock && autoCampaign ? (
        <div>
          {unitListLabel ? (
            <span className="text-sm text-ink-subtle line-through">{unitListLabel}</span>
          ) : null}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wideish text-ink-subtle">
              {t.badges.inCart}
            </span>
            <span className="text-2xl font-bold text-ink">{autoFinalLabel}</span>
            <span className="inline-flex items-center bg-ink px-1.5 py-0.5 text-[11px] font-bold text-surface">
              {autoCampaign.discountText}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {t.detail.campaignNoCode}
            {autoCampaign.minOrderLabel
              ? ` · ${format(t.detail.campaignMinOrder, { amount: autoCampaign.minOrderLabel })}`
              : ""}
          </p>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          {numeric ? (
            <>
              <span className="text-2xl font-semibold text-ink">{unitPriceLabel}</span>
              {compareUnitLabel ? (
                <span className="text-sm text-ink-subtle line-through">{compareUnitLabel}</span>
              ) : null}
            </>
          ) : (
            <span className="text-lg font-semibold text-ink">{primaryPriceText(price, t)}</span>
          )}
        </div>
      )}
      {/* F4B — EU Omnibus notu: indirim varken son 30 günün en düşük fiyatı.
          Yeni hiyerarside uzeri cizili liste fiyatinin altinda kucuk not kalir. */}
      {numeric && price.lowestRecentLabel ? (
        <p className="mt-1 text-xs text-ink-subtle">
          {format(t.badges.omnibusLowest, { amount: price.lowestRecentLabel })}
        </p>
      ) : null}
      {numeric ? <p className="mt-1 text-xs text-ink-subtle">{t.buyBox.priceNote}</p> : null}

      {/* F4A.1/F4A.3 — Aktif kampanya bilgisi (fiyata yakin). Otomatik sepet
          indirimi GUVENLI tahminliyse yukaridaki fiyat blogunda (uzeri cizili
          hiyerarsi) sunulur; burada YALNIZ public kupon karti ya da guvenli
          tahmin YOKKEN otomatik fallback kutusu gosterilir. Metinler sunucu-
          otoriter public rozet projeksiyonundan turetilir, tutar hesabi YOK. */}
      {detail.campaign && !showAutoPriceBlock ? <DetailCampaign campaign={detail.campaign} t={t} /> : null}

      {/* Stok durumu */}
      <div className="mt-4">
        <Badge tone={stock.tone}>{stock.text}</Badge>
      </div>

      {/* Varyant secimi — TODO-165: fashion modda renk swatch + beden ızgarası; aksi halde
          MEVCUT düz varyant-butonu davranışı BİREBİR korunur. */}
      {fashionMode && fashion ? (
        <div className="mt-6 space-y-6">
          {/* Renk swatch satırı (media-tanımlayıcı eksen; seçim galeriyi de değiştirir) */}
          {colorAxis ? (
            <div>
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
                  {colorAxis.name}
                </p>
                {selectedColorOption ? (
                  <span className="text-xs text-ink-muted">
                    {format(t.detail.fashion.optionSelected, { label: selectedColorOption.label })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label={colorAxis.name}>
                {colorAxis.options.map((option) => {
                  const active = axisSelection[colorAxis.attributeDefinitionId] === option.optionId;
                  const soldOut = !optionInStock(colorAxis.attributeDefinitionId, option.optionId);
                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      aria-pressed={active}
                      aria-label={option.label}
                      title={`${option.label}`}
                      onClick={() => selectColor(option.optionId)}
                      className={[
                        "relative flex h-9 w-9 items-center justify-center rounded-full border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        option.colorHex
                          ? isLightHex(option.colorHex)
                            ? "border-ink-subtle" // acik/beyaz renkler beyaz panele karismasin diye belirgin kenarlik
                            : "border-line"
                          : "border-dashed border-line-strong bg-surface-muted",
                        active ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "",
                        soldOut ? "opacity-40" : "",
                      ].join(" ")}
                      style={option.colorHex ? { backgroundColor: option.colorHex } : undefined}
                    >
                      {active ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                          <path
                            d="M3 7.5l2.5 2.5L11 4.5"
                            stroke={isLightHex(option.colorHex) ? "#111" : "#fff"}
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                      <span className="sr-only">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Beden (ve varsa diğer) buton ızgarası — stokta olmayan seçenek devre dışı + üstü çizili */}
          {gridAxes.map((axis) => {
            const isSize = axis.kind === "size";
            return (
              <div key={axis.attributeDefinitionId}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
                    {axis.name}
                  </p>
                  {isSize && fashion.sizeChart ? (
                    <button
                      type="button"
                      onClick={() => setSizeChartOpen(true)}
                      className="text-[11px] font-medium uppercase tracking-wideish text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {t.detail.fashion.sizeGuide}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={axis.name}>
                  {axis.options.map((option) => {
                    const active = axisSelection[axis.attributeDefinitionId] === option.optionId;
                    const soldOut = !optionInStock(axis.attributeDefinitionId, option.optionId);
                    return (
                      <button
                        key={option.optionId}
                        type="button"
                        aria-pressed={active}
                        // TODO-165: stokta olmayan beden DAİMA devre dışı (seçili olsa bile).
                        // Renk değişiminde auto-heal seçili bedeni stokta olana taşır; bu yüzden
                        // normalde seçili beden OOS kalmaz, ama başlangıç/uç durumda da korunur.
                        disabled={soldOut}
                        onClick={() => selectAxisOption(axis.attributeDefinitionId, option.optionId)}
                        className={[
                          "min-w-[3rem] border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          active
                            ? "border-ink bg-ink text-surface"
                            : "border-line text-ink-muted hover:border-ink hover:text-ink",
                          soldOut
                            ? "cursor-not-allowed text-line-strong line-through hover:border-line hover:text-line-strong"
                            : "",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Az stok göstergesi (yalnız seçili varyant stoğu 1–5 arası) */}
          {lowStock && selected ? (
            <p role="status" className="text-xs font-medium text-ink">
              {format(t.detail.fashion.lowStock, { count: selected.available ?? 0 })}
            </p>
          ) : null}

          {selected ? (
            <p className="text-xs text-ink-subtle">
              {t.detail.skuLabel}: <span className="font-medium text-ink-muted">{selected.sku}</span>
            </p>
          ) : null}
        </div>
      ) : variants.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
            {t.detail.variantTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const active = variant.id === selected?.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedVariantId(variant.id);
                    setAdded(false);
                  }}
                  className={[
                    "border px-4 py-2 text-sm transition-colors",
                    active
                      ? "border-ink bg-ink text-surface"
                      : "border-line text-ink-muted hover:border-ink hover:text-ink",
                  ].join(" ")}
                >
                  {variant.title}
                </button>
              );
            })}
          </div>
          {selected ? (
            <p className="mt-2.5 text-xs text-ink-subtle">
              {t.detail.skuLabel}: <span className="font-medium text-ink-muted">{selected.sku}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Adet (yalniz ONLINE satilabilir) — stok limitine duyarli */}
      {commerce.showQuantity ? (
        <div className="mt-6">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wideish text-ink-subtle">
            {t.detail.quantityLabel}
          </p>
          <div className="inline-flex items-center border border-line">
            <button
              type="button"
              aria-label={t.buyBox.decrease}
              disabled={outOfStock || quantity <= commerce.minQuantity}
              onClick={() => {
                setQuantity((q) => clamp(q - 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-medium text-ink">{quantity}</span>
            <button
              type="button"
              aria-label={t.buyBox.increase}
              disabled={outOfStock || quantity >= maxQty}
              onClick={() => {
                setQuantity((q) => clamp(q + 1));
                setAdded(false);
              }}
              className="h-10 w-10 text-lg text-ink-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent"
            >
              +
            </button>
          </div>
          {/* Stok sinir uyarisi: kullanici en fazla stok kadar secebilir. */}
          {atStockLimit ? (
            <p role="status" className="mt-2 text-xs font-medium text-ink-muted">
              {format(t.buyBox.maxQtyNote, { max: maxQty })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Stokta yok: adet/CTA devre disi + net mesaj */}
      {outOfStock ? (
        <p role="status" className="mt-4 text-sm font-medium text-ink">
          {t.buyBox.outOfStock}
        </p>
      ) : null}

      {/* Satis-modeli aciklamasi (ONLINE disi) */}
      <SalesModeLead detail={detail} t={t} />

      {/* CTA — sayfanin TEKIL birincil eylemi accent (variant="cta") tasir;
          ikincil "Hemen al" notr secondary'dir. */}
      <div className="mt-6 flex flex-col gap-2.5">
        {commerce.primaryCta === "ADD_TO_CART" ? (
          <>
            <Button
              variant="cta"
              className="w-full"
              disabled={!canAddToCart || isPending}
              onClick={addToCart}
            >
              {detail.callToActionLabel ?? ctaLabel(commerce.primaryCta, t)}
            </Button>
            {commerce.secondaryCta ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={!canAddToCart || isPending}
                onClick={buyNow}
              >
                {ctaLabel(commerce.secondaryCta, t)}
              </Button>
            ) : null}
            {/* Sepete eklendi geri bildirimi (yonlendirme yok) */}
            {added ? (
              <div
                role="status"
                className="mt-1 flex items-center justify-between gap-2 border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink"
              >
                <span className="font-medium">✓ {t.buyBox.addedToCart}</span>
                <Link href="/cart" className="text-xs font-semibold underline underline-offset-4 hover:text-ink-muted">
                  {t.buyBox.goToCart}
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <Button variant="cta" className="w-full" disabled={commerce.primaryCtaDisabled}>
            {detail.callToActionLabel ?? ctaLabel(commerce.primaryCta, t)}
          </Button>
        )}
      </div>

      {/* TODO-159D (ADR-093) — Gerçek favori (ürün-seviyesi; PLP ile tutarlı) + paylaş (yer tutucu) */}
      <div className="mt-4 flex items-center justify-center gap-4 text-[11px] uppercase tracking-wideish text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <WishlistHeartButton
            productId={detail.id}
            size={15}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-ink disabled:opacity-60"
            labels={{
              add: t.home.card.wishlistAdd,
              remove: t.home.card.wishlistRemove,
              savedFeedback: t.home.card.wishlistSavedFeedback,
              removedFeedback: t.home.card.wishlistRemovedFeedback,
              error: t.home.card.wishlistError,
            }}
          />
          {t.buyBox.favorite}
        </span>
        <span aria-hidden>·</span>
        <span>{t.buyBox.share}</span>
      </div>

      {/* Guven kartlari */}
      <dl className="mt-6 space-y-3 border-t border-line pt-5">
        <TrustRow title={t.buyBox.delivery.title} body={t.buyBox.delivery.body} />
        <TrustRow title={t.buyBox.returns.title} body={t.buyBox.returns.body} />
        <TrustRow title={t.buyBox.secure.title} body={t.buyBox.secure.body} />
      </dl>

      {/* Satici kartı */}
      <div className="mt-4 border border-line bg-surface-muted p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">{t.buyBox.seller.title}</p>
          <Badge tone="outline">{t.buyBox.seller.badge}</Badge>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">{t.buyBox.seller.body}</p>
      </div>

      {/* TODO-165 — Beden tablosu modalı (yalnız fashion + published beden tablosu varsa) */}
      {fashionMode && fashion?.sizeChart ? (
        <SizeChartModal
          chart={fashion.sizeChart}
          open={sizeChartOpen}
          onClose={() => setSizeChartOpen(false)}
          t={t.detail.fashion}
        />
      ) : null}
    </div>
  );
}

/**
 * TODO-165 — Renk swatch onay-işareti kontrastı: açık renkte koyu tik, koyu renkte beyaz
 * (kaba Rec. 601 luma eşiği; hex yoksa açık kabul → koyu tik). Facet swatch'la aynı mantık.
 */
function isLightHex(hex: string | null): boolean {
  if (!hex) return true;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return true;
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/**
 * F4A.3 — Urun detay kampanya kutusu (notr DS yuzeyi; ton metinle ayrisir).
 * AUTOMATIC_CART_DISCOUNT: "Sepette %10 indirim" + "Kod gerekmez" + alt limit.
 * PUBLIC_COUPON: dashed kupon karti — indirim tutari, alt limit, son kullanma,
 * kupon kodu ve aksiyon (sepete ekle / kopyala). Sadece "Kupon kodu gerektirir"
 * ile birakmaz — kullaniciya yol verir.
 */
function DetailCampaign({
  campaign,
  t,
}: {
  campaign: StorefrontCampaignView;
  t: StorefrontDictionary;
}) {
  if (campaign.displayKind === "AUTOMATIC_CART_DISCOUNT") {
    return (
      <div className="mt-4 border border-line bg-surface-muted px-4 py-3">
        {/* F4A.6 — Guvenli nihai fiyat varsa belirgin "Sepette" fiyat blogu;
            yoksa yalniz "Sepette %X indirim" etiketi (sahte fiyat gosterilmez). */}
        {campaign.estimatedFinalLabel ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wideish text-ink-subtle">
              {t.badges.inCart}
            </span>
            <span className="text-lg font-bold text-ink">{campaign.estimatedFinalLabel}</span>
            <span className="inline-flex items-center bg-ink px-1.5 py-0.5 text-[11px] font-bold text-surface">
              {campaign.discountText}
            </span>
          </div>
        ) : (
          <p className="text-sm font-semibold text-ink">{campaign.label}</p>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          {t.detail.campaignNoCode}
          {campaign.minOrderLabel
            ? ` · ${format(t.detail.campaignMinOrder, { amount: campaign.minOrderLabel })}`
            : ""}
        </p>
      </div>
    );
  }
  return <DetailCouponCard campaign={campaign} t={t} />;
}

function DetailCouponCard({
  campaign,
  t,
}: {
  campaign: StorefrontCampaignView;
  t: StorefrontDictionary;
}) {
  const [isPending, startTransition] = useTransition();
  const [claimed, setClaimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const detail = t.detail;

  function addToWallet() {
    if (!campaign.couponCode) return;
    startTransition(async () => {
      const result = await claimCouponAction(campaign.couponCode!);
      if (result.status === "ok") setClaimed(true);
    });
  }

  async function copyCode() {
    if (!campaign.couponCode) return;
    try {
      await navigator.clipboard.writeText(campaign.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* pano erisimi yoksa sessizce yut */
    }
  }

  return (
    <div className="mt-4 border border-dashed border-line-strong bg-surface-muted px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wideish text-ink-subtle">
          {detail.couponCardTitle}
        </p>
        <span className="text-sm font-bold text-ink">{campaign.discountText}</span>
      </div>
      {campaign.couponCode ? (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-surface px-2 py-1 font-mono text-sm font-semibold tracking-wide text-ink ring-1 ring-line-strong">
            {campaign.couponCode}
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="text-xs font-medium text-ink underline underline-offset-4 hover:text-ink-muted"
          >
            {copied ? detail.couponCopied : detail.couponCopy}
          </button>
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-ink-muted">{detail.couponManualHint}</p>
      )}
      <p className="mt-2.5 text-[11px] text-ink-subtle">
        {campaign.minOrderLabel
          ? format(detail.campaignMinOrder, { amount: campaign.minOrderLabel })
          : detail.campaignNoMinOrder}
        {campaign.endsAt ? ` · ${format(detail.couponExpiry, { date: formatDetailDate(campaign.endsAt) })}` : ""}
      </p>
      {campaign.couponCode ? (
        <div className="mt-3">
          {claimed ? (
            <p className="text-xs font-medium text-ink">✓ {detail.couponAddedToWallet}</p>
          ) : (
            <Button variant="secondary" size="sm" onClick={addToWallet} disabled={isPending}>
              {detail.couponAddToWallet}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatDetailDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      // Saat dilimi SABIT: sunucu (UTC) ile istemci (yerel) ayni takvim gununu
      // uretsin; aksi halde gun sinirindaki tarihlerde hydration uyusmazligi olur.
      timeZone: "Europe/Istanbul",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function TrustRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-medium text-ink">{title}</dt>
      <dd className="text-xs text-ink-muted">{body}</dd>
    </div>
  );
}

function SalesModeLead({
  detail,
  t,
}: {
  detail: StorefrontProductDetail;
  t: StorefrontDictionary;
}) {
  const { commerce } = detail;
  if (commerce.salesMode === "ONLINE") return null;

  let lead = "";
  if (commerce.salesMode === "INQUIRY") lead = t.salesMode.inquiryLead;
  else if (commerce.salesMode === "APPOINTMENT") lead = t.salesMode.appointmentLead;
  else if (commerce.salesMode === "WHATSAPP") lead = t.salesMode.whatsappLead;
  else lead = t.salesMode.catalogLead;

  return (
    <div className="mt-6 border border-line bg-surface-muted p-4">
      <p className="text-sm text-ink">{lead}</p>
      {commerce.showInquiry ? (
        <p className="mt-2 text-xs font-medium text-ink-muted">
          {detail.inquiryFormTitle ?? t.salesMode.inquiryTitleFallback}
        </p>
      ) : null}
      {commerce.showAppointmentNote ? (
        <p className="mt-2 text-xs text-ink-muted">
          {detail.appointmentNote ?? t.salesMode.appointmentNoteFallback}
        </p>
      ) : null}
      {commerce.showWhatsappTemplate && detail.whatsappMessageTemplate ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wideish text-ink-subtle">
            {t.salesMode.whatsappTemplateTitle}
          </p>
          <p className="mt-1.5 bg-surface px-3 py-2 text-xs text-ink-muted ring-1 ring-inset ring-line">
            {detail.whatsappMessageTemplate}
          </p>
        </div>
      ) : null}
    </div>
  );
}
