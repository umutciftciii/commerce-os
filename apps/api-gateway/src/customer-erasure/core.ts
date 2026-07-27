/**
 * TD-131 (ADR-149…155) — Customer Data Erasure Workflow: SAF çekirdek.
 *
 * Prisma/Fastify bağımlılığı YOK → tam birim-test edilebilir. Kişisel-veri silme
 * (ERASE_PERSONAL_DATA) için: onay ifadesi, anonim placeholder üreticileri,
 * Customer anonimleştirme veri objesi ve PII-SIZ audit alan adları burada.
 *
 * İki aksiyon net ayrılır (ADR-149):
 *   DEACTIVATE          → PASSIVE, veri korunur, geri alınabilir.
 *   ERASE_PERSONAL_DATA → ERASED (terminal), kişisel+davranışsal veri silinir/
 *                         anonimleşir, finansal/yasal kayıt korunur, geri alınamaz.
 */

/** Apply için istemcinin BİREBİR yazması gereken sabit onay ifadesi (ADR-152). */
export const CUSTOMER_ERASURE_CONFIRMATION_PHRASE = "KİŞİSEL VERİLERİ SİL";

export const ANONYMIZED_FIRST_NAME = "Anonim";
export const ANONYMIZED_LAST_NAME = "Müşteri";
export const ANONYMIZED_FULL_NAME = `${ANONYMIZED_FIRST_NAME} ${ANONYMIZED_LAST_NAME}`;
/** OrderAddress temas PII'si temizlenirken adres satırı yer tutucusu. */
export const ANONYMIZED_ADDRESS_LINE = "—";

/**
 * Benzersiz anonim e-posta placeholder'ı. `@@unique([storeId, email])` kısıtını
 * korur (customerId store-içinde tekildir); orijinal e-posta slotu boşalır.
 * `.invalid` TLD (RFC 2606) → gerçek bir adrese ASLA çözülmez.
 */
export function erasedEmailPlaceholder(customerId: string): string {
  return `erased-${customerId}@erased.invalid`;
}

/** Onay ifadesi doğrulama (baştaki/sondaki boşluk toleranslı, aksi halde birebir). */
export function isValidErasureConfirmation(phrase: string | undefined | null): boolean {
  return typeof phrase === "string" && phrase.trim() === CUSTOMER_ERASURE_CONFIRMATION_PHRASE;
}

/** Customer satırında anonimleştirilen alan adları (audit metadata — PII DEĞİL). */
export const ANONYMIZED_CUSTOMER_FIELDS: readonly string[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "birthDate",
  "gender",
  "emailVerifiedAt",
  "phoneVerifiedAt",
] as const;

/** Order satırında anonimleştirilen temas alanları (yasal fatura kimliği KORUNUR). */
export const ANONYMIZED_ORDER_FIELDS: readonly string[] = ["customerEmail", "billingEmail"] as const;

/** OrderAddress'te temizlenen temas alanları (city/countryCode kaba düzeyde korunur). */
export const ANONYMIZED_ORDER_ADDRESS_FIELDS: readonly string[] = [
  "fullName",
  "phone",
  "addressLine1",
  "addressLine2",
  "district",
  "postalCode",
] as const;

/** ERASE_PERSONAL_DATA sonrası Customer satırına yazılacak anonim veri objesi. */
export interface CustomerAnonymizationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: null;
  birthDate: null;
  gender: null;
  emailVerifiedAt: null;
  phoneVerifiedAt: null;
  status: "ERASED";
  erasedAt: Date;
  erasedByUserId: string;
  eraseReason: string;
}

export function buildCustomerAnonymization(input: {
  customerId: string;
  now: Date;
  actorUserId: string;
  reason: string;
}): CustomerAnonymizationData {
  return {
    firstName: ANONYMIZED_FIRST_NAME,
    lastName: ANONYMIZED_LAST_NAME,
    email: erasedEmailPlaceholder(input.customerId),
    phone: null,
    birthDate: null,
    gender: null,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    status: "ERASED",
    erasedAt: input.now,
    erasedByUserId: input.actorUserId,
    eraseReason: input.reason,
  };
}

/** Silinen tablo başına kayıt sayıları (preview count'u = apply deletedCount ile aynı şekil). */
export interface ErasureDeleteCounts {
  sessions: number;
  credentials: number;
  credentialTokens: number;
  otpVerifications: number;
  ibans: number;
  communicationPreferences: number;
  addresses: number;
  coupons: number;
  lists: number;
  listItems: number;
  reviewHelpfulVotes: number;
  recentlyViewed: number;
  recommendationEvents: number;
}

export function emptyDeleteCounts(): ErasureDeleteCounts {
  return {
    sessions: 0,
    credentials: 0,
    credentialTokens: 0,
    otpVerifications: 0,
    ibans: 0,
    communicationPreferences: 0,
    addresses: 0,
    coupons: 0,
    lists: 0,
    listItems: 0,
    reviewHelpfulVotes: 0,
    recentlyViewed: 0,
    recommendationEvents: 0,
  };
}

export function totalDeleted(counts: ErasureDeleteCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
