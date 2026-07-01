/**
 * TODO-125 (ADR-047) — Checkout kargo SEÇENEK üreteci (saf/deterministik).
 *
 * Bir "kargo seçeneği" = AKTİF bir ShippingRatePlan. Ücret store TARİFE'sinden
 * price-engine ile hesaplanır (ADR-044; SAĞLAYICI canlı quote DEĞİL). Seçeneğe
 * taşıyıcı görünüm bilgisi (ad + public logo) ENABLED ShippingProviderConfig'ten
 * gevşek ilişkiyle (plan.provider) eklenir. Paralel bir kargo modeli YOKTUR.
 *
 * prisma/fastify import ETMEZ → birim testleri tek başına koşar. AUTHORITATIVE:
 * fiyat ve seçim doğrulaması burada/backend'de yapılır; istemci fiyatına güvenilmez.
 */
import type { ShippingOption } from "@commerce-os/contracts";
import { computeStoreShippingQuote } from "./rate-plan-service.js";
import type { EngineAddress, EngineCart, EngineRatePlan, ShippingQuoteOutcome } from "./price-engine.js";

/** ENABLED provider config'ten gelen PUBLIC görünüm bilgisi (secret DEĞİL). */
export interface ProviderDisplay {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string | null;
}

export type ProviderDisplayMap = Map<EngineRatePlan["provider"], ProviderDisplay>;

export interface BuildShippingOptionsInput {
  plans: EngineRatePlan[];
  providerDisplays: ProviderDisplayMap;
  cart: EngineCart;
  address: EngineAddress | null;
  addressKnown: boolean;
  /** Müşterinin seçtiği seçenek (= ratePlanId). Geçersizse güvenli varsayılana düşülür. */
  requestedOptionId?: string | null;
  now?: Date;
}

export interface SelectedShippingOption {
  plan: EngineRatePlan;
  outcome: ShippingQuoteOutcome;
  option: ShippingOption;
}

export interface ShippingOptionsResult {
  /** Vitrinde listelenen seçenekler. Checkout (adres var): yalnız fiyatlanabilir/uygun
   * (available=true) olanlar. Sepet (adres yok): tüm aktif planlar, available=false. */
  options: ShippingOption[];
  selectedOptionId: string | null;
  selected: SelectedShippingOption | null;
  /** Tüm aktif plan kimlikleri (cross-store/tamper doğrulaması için). */
  activeOptionIds: string[];
}

/** plan.provider için güvenli görünen ad fallback'i (config yoksa). */
function providerFallbackLabel(provider: EngineRatePlan["provider"]): string {
  switch (provider) {
    case "DHL_ECOMMERCE":
      return "DHL";
    case "GELIVER":
      return "Geliver";
    case "MOCK":
      return "Demo Kargo";
    default:
      return "Kargo";
  }
}

function toOption(
  plan: EngineRatePlan,
  display: ProviderDisplay | undefined,
  outcome: ShippingQuoteOutcome,
  addressKnown: boolean,
): ShippingOption {
  const available = addressKnown && outcome.status === "OK";
  return {
    optionId: plan.id,
    providerType: plan.provider,
    providerName: display?.displayName ?? providerFallbackLabel(plan.provider),
    serviceName: plan.name,
    priceMinor: available ? (outcome.amountMinor ?? 0) : null,
    currency: plan.currency,
    freeShipping: available ? outcome.freeShipping : false,
    estimatedDelivery: plan.deliveryEstimate,
    logoUrl: display?.logoUrl ?? null,
    logoAlt: display?.logoAlt ?? null,
    available,
  };
}

/**
 * Aktif planları fiyatlandırır, seçenek listesini ve güvenli SEÇİLİ seçeneği üretir.
 * Seçim sırası: (1) geçerli requestedOptionId; (2) default plan; (3) en ucuz; (4) ilk.
 */
export function buildShippingOptions(input: BuildShippingOptionsInput): ShippingOptionsResult {
  const now = input.now ?? new Date();
  const activeOptionIds = input.plans.map((p) => p.id);

  // Her plan için quote + DTO. Adres biliniyorsa yalnız OK seçenekler listelenir
  // (uygun olmayan plan bu sepet için seçim değildir). Adres yoksa hepsi listelenir
  // (taşıyıcılar görünür ama fiyatlanamaz → available=false).
  const computed = input.plans.map((plan) => {
    const display = input.providerDisplays.get(plan.provider);
    const { outcome } = computeStoreShippingQuote(plan, input.cart, input.address, {
      addressKnown: input.addressKnown,
      now,
    });
    return { plan, outcome, option: toOption(plan, display, outcome, input.addressKnown) };
  });

  const listed = input.addressKnown ? computed.filter((c) => c.option.available) : computed;
  const options = listed.map((c) => c.option);

  // Seçilebilir aday set'i: checkout'ta available olanlar; sepet'te tüm listelenenler.
  const selectable = listed;
  const byId = new Map(selectable.map((c) => [c.plan.id, c] as const));

  let selectedEntry: (typeof selectable)[number] | null = null;
  const requested = input.requestedOptionId?.trim() || null;
  if (requested && byId.has(requested)) {
    selectedEntry = byId.get(requested)!;
  } else if (selectable.length > 0) {
    selectedEntry =
      selectable.find((c) => c.plan.isDefault) ??
      pickCheapest(selectable) ??
      selectable[0];
  }

  return {
    options,
    selectedOptionId: selectedEntry?.plan.id ?? null,
    selected: selectedEntry
      ? { plan: selectedEntry.plan, outcome: selectedEntry.outcome, option: selectedEntry.option }
      : null,
    activeOptionIds,
  };
}

function pickCheapest<T extends { option: ShippingOption }>(entries: T[]): T | null {
  let best: T | null = null;
  for (const e of entries) {
    if (e.option.priceMinor === null) continue;
    if (best === null || e.option.priceMinor < (best.option.priceMinor ?? Infinity)) {
      best = e;
    }
  }
  return best;
}
