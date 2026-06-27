import type {
  PaymentMethodType,
  PaymentProviderMode,
  PaymentProviderStatus,
  PaymentProviderType,
} from "@prisma/client";

/**
 * F3B.2 — Payment provider resolver (saf, yan etkisiz).
 *
 * Store bazinda ENABLED provider config'leri currency/amount/method/mode'a gore
 * filtreler ve DETERMINISTIK sirayla (priority asc → createdAt asc → id asc) dondurur.
 *
 * Guvenlik kurali: LIVE/production ortaminda (isLiveEnv=true) MOCK provider asla
 * secilmez/fallback olmaz. TEST/dev/demo ortaminda MOCK serbesttir.
 */

export interface ResolvableProviderConfig {
  id: string;
  provider: PaymentProviderType;
  status: PaymentProviderStatus;
  mode: PaymentProviderMode;
  priority: number;
  supportedMethods: PaymentMethodType[];
  supportedCurrencies: string[];
  minAmount: number | null;
  maxAmount: number | null;
  fallbackEnabled: boolean;
  createdAt: Date;
}

export interface PaymentResolutionCriteria {
  currency: string;
  amount: number;
  method: PaymentMethodType;
  mode: PaymentProviderMode;
  /** Calisma ortami canli mi? true ise MOCK provider asla secilmez. */
  isLiveEnv: boolean;
}

function matches(config: ResolvableProviderConfig, criteria: PaymentResolutionCriteria): boolean {
  if (config.status !== "ENABLED") {
    return false;
  }
  if (config.mode !== criteria.mode) {
    return false;
  }
  // Canli ortamda MOCK provider devre disi (primary de fallback de olamaz).
  if (criteria.isLiveEnv && config.provider === "MOCK") {
    return false;
  }
  if (!config.supportedCurrencies.includes(criteria.currency)) {
    return false;
  }
  if (!config.supportedMethods.includes(criteria.method)) {
    return false;
  }
  if (config.minAmount !== null && criteria.amount < config.minAmount) {
    return false;
  }
  if (config.maxAmount !== null && criteria.amount > config.maxAmount) {
    return false;
  }
  return true;
}

function deterministicSort(a: ResolvableProviderConfig, b: ResolvableProviderConfig): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  const aTime = a.createdAt.getTime();
  const bTime = b.createdAt.getTime();
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Kriterlere uyan provider'lari deterministik sirayla dondurur. */
export function resolvePaymentProviders<T extends ResolvableProviderConfig>(
  configs: T[],
  criteria: PaymentResolutionCriteria,
): T[] {
  return configs.filter((config) => matches(config, criteria)).sort(deterministicSort);
}

/** Birincil provider (en yuksek oncelik). Uygun yoksa null. */
export function selectPaymentProvider<T extends ResolvableProviderConfig>(
  configs: T[],
  criteria: PaymentResolutionCriteria,
): T | null {
  return resolvePaymentProviders(configs, criteria)[0] ?? null;
}

/**
 * Birincil provider basarisiz olursa denenebilecek fallback zinciri.
 * Yalnizca primary'nin fallbackEnabled oldugu durumda anlamlidir; cagiran taraf
 * primary.fallbackEnabled kontrolunu yapar. Burada primary haricindeki uygun
 * provider'lar deterministik sirayla doner (LIVE-MOCK guard zaten uygulanmistir).
 */
export function selectFallbackProviders<T extends ResolvableProviderConfig>(
  configs: T[],
  criteria: PaymentResolutionCriteria,
): T[] {
  return resolvePaymentProviders(configs, criteria).slice(1);
}
