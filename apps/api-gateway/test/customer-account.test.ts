import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import { isCustomerVisibleShipmentEvent } from "../src/customers/index.js";
import type {
  CustomerAddressInputRecord,
  CustomerAddressRecord,
  CustomerAuthRecord,
  CustomerDataAccess,
  CustomerIbanRecord,
  CustomerOtpRecord,
  CustomerSessionRecord,
} from "../src/customers/index.js";
import type {
  BillingType,
  CustomerGender,
  CustomerOtpChannel,
  CustomerOtpPurpose,
} from "@prisma/client";

/**
 * F3B.3 — Storefront musteri hesabi gateway entegrasyon testleri. In-memory
 * CustomerDataAccess fake'i ile gercek route'lar app.inject ile cagrilir; OTP
 * dev-bypass kodu (CUSTOMER_OTP_DEV_CODE) ile kayit akisi DB'siz tamamlanir.
 * Dogrulananlar: 3-adim kayit, OTP hata, email+GSM giris, cikis, adres/IBAN
 * dogrulama + maskeleme, store-scope ownership izolasyonu.
 */
const DEV_CODE = "000000";
const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
  CUSTOMER_SESSION_TTL_SECONDS: 3600,
  CUSTOMER_OTP_TTL_SECONDS: 300,
  CUSTOMER_OTP_MAX_ATTEMPTS: 5,
  CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS: 0,
  CUSTOMER_OTP_DEV_CODE: DEV_CODE,
};

const demoStore = {
  id: "store_demo",
  name: "Demo Store",
  slug: "demo-store",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

// Customer route'lari yalnizca findStoreBySlug'a dokunur; kalan AppDataAccess
// yuzeyini test icin cast ediyoruz (bu testte cagrilmaz).
const dataAccess = {
  async findStoreBySlug(slug: string) {
    return slug === demoStore.slug ? demoStore : null;
  },
} as unknown as AppDataAccess;

interface SeededOrderLine {
  variantId: string;
  productSlug: string;
  sku: string;
  title: string;
  variantTitle: string;
  quantity: number;
  unitPriceAmount?: number;
}

interface SeededOrder {
  customerId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  totalAmount: number;
  createdAt: Date;
  lines: SeededOrderLine[];
  // Detay (opsiyonel; verilmezse güvenli varsayılan türetilir).
  subtotalAmount?: number;
  discountAmount?: number;
  shippingAmount?: number;
  taxAmount?: number;
  placedAt?: Date | null;
  cancelledAt?: Date | null;
  billingType?: BillingType | null;
  billingName?: string | null;
  billingCompanyName?: string | null;
  billingTaxOffice?: string | null;
  billingTaxId?: string | null;
  billingTaxNumber?: string | null;
  addresses?: {
    type: string;
    fullName: string;
    phone: string | null;
    countryCode: string;
    city: string;
    district: string | null;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string | null;
  }[];
  payment?: {
    provider: string;
    method: string;
    cardBrand: string | null;
    cardLast4: string | null;
    installmentCount: number;
    providerReference: string | null;
    threeDsApplied: boolean;
    paidAt: Date | null;
  } | null;
  // TODO-117 — Kargo takip (opsiyonel). events ham verilir; fake, gerçek
  // getOrderDetail gibi müşteri-görünür filtre + son işlem noktası türetir.
  shipment?: {
    providerName: string;
    logoUrl: string | null;
    logoAlt: string | null;
    status: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    updatedAt: Date;
    events: {
      eventType: string;
      statusText: string | null;
      location: string | null;
      occurredAt: Date | null;
    }[];
  } | null;
}

class MemoryCustomerDataAccess implements CustomerDataAccess {
  private seq = 0;
  customers: CustomerAuthRecord[] = [];
  credentials = new Map<string, string>();
  otps: (CustomerOtpRecord & {
    storeId: string;
    customerId: string;
    purpose: CustomerOtpPurpose;
  })[] = [];
  sessions = new Map<
    string,
    { id: string; storeId: string; customerId: string; expiresAt: Date; revokedAt: Date | null }
  >();
  prefs = new Map<string, { smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean }>();
  addresses: (CustomerAddressRecord & { storeId: string; customerId: string; deleted: boolean })[] = [];
  ibans: (CustomerIbanRecord & { storeId: string; customerId: string; deleted: boolean })[] = [];
  orders: { storeId: string; customerId: string; order: SeededOrder }[] = [];

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  seedOrder(order: SeededOrder) {
    this.orders.push({ storeId: demoStore.id, customerId: order.customerId, order });
  }

  async findByEmail(storeId: string, email: string) {
    return this.customers.find((c) => c.storeId === storeId && c.email === email) ?? null;
  }
  async findByPhone(storeId: string, phone: string) {
    return this.customers.find((c) => c.storeId === storeId && c.phone === phone) ?? null;
  }
  async findById(storeId: string, id: string) {
    return this.customers.find((c) => c.storeId === storeId && c.id === id) ?? null;
  }
  async createPending(storeId: string, input: { email: string | null; phone: string | null }) {
    const record: CustomerAuthRecord = {
      id: this.id("cus"),
      storeId,
      email: input.email,
      phone: input.phone,
      firstName: null,
      lastName: null,
      birthDate: null,
      gender: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: "PASSIVE",
    };
    this.customers.push(record);
    return record;
  }
  async hasCredential(customerId: string) {
    return this.credentials.has(customerId);
  }
  async findCredentialHash(customerId: string) {
    return this.credentials.get(customerId) ?? null;
  }
  async setCredential(_storeId: string, customerId: string, passwordHash: string) {
    this.credentials.set(customerId, passwordHash);
  }
  async updateCredential(customerId: string, passwordHash: string) {
    this.credentials.set(customerId, passwordHash);
  }
  async updateProfile(
    _storeId: string,
    customerId: string,
    input: { firstName: string; lastName: string; birthDate: Date | null; gender: CustomerGender | null },
  ) {
    const c = this.customers.find((x) => x.id === customerId)!;
    Object.assign(c, input);
    return c;
  }
  async activateAndVerifyContact(
    _storeId: string,
    customerId: string,
    channel: CustomerOtpChannel,
    profile: { firstName: string; lastName: string },
  ) {
    const c = this.customers.find((x) => x.id === customerId)!;
    c.firstName = profile.firstName;
    c.lastName = profile.lastName;
    c.status = "ACTIVE";
    if (channel === "EMAIL") c.emailVerifiedAt = new Date();
    else c.phoneVerifiedAt = new Date();
    return c;
  }
  async createOtp(input: {
    storeId: string;
    customerId: string;
    purpose: CustomerOtpPurpose;
    channel: CustomerOtpChannel;
    destination: string;
    codeHash: string;
    expiresAt: Date;
  }) {
    this.otps.push({
      id: this.id("otp"),
      storeId: input.storeId,
      customerId: input.customerId,
      purpose: input.purpose,
      channel: input.channel,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
    });
  }
  async latestOtp(storeId: string, customerId: string, purpose: CustomerOtpPurpose) {
    const list = this.otps
      .filter((o) => o.storeId === storeId && o.customerId === customerId && o.purpose === purpose && !o.consumedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list[0] ?? null;
  }
  async bumpOtpAttempt(id: string) {
    const o = this.otps.find((x) => x.id === id);
    if (o) o.attemptCount += 1;
  }
  async consumeOtp(id: string) {
    const o = this.otps.find((x) => x.id === id);
    if (o) o.consumedAt = new Date();
  }
  async createSession(input: {
    storeId: string;
    customerId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    this.sessions.set(input.tokenHash, {
      id: this.id("ses"),
      storeId: input.storeId,
      customerId: input.customerId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }
  async findSessionByTokenHash(tokenHash: string): Promise<CustomerSessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    if (!s) return null;
    const customer = this.customers.find((c) => c.id === s.customerId)!;
    return {
      id: s.id,
      storeId: s.storeId,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      customer,
    };
  }
  async revokeSession(id: string) {
    for (const s of this.sessions.values()) {
      if (s.id === id && !s.revokedAt) {
        s.revokedAt = new Date();
        return true;
      }
    }
    return false;
  }
  async getCommPref(_storeId: string, customerId: string) {
    return this.prefs.get(customerId) ?? { smsEnabled: false, emailEnabled: true, phoneEnabled: false };
  }
  async upsertCommPref(
    _storeId: string,
    customerId: string,
    input: { smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean },
  ) {
    this.prefs.set(customerId, input);
  }
  async listAddresses(storeId: string, customerId: string) {
    return this.addresses.filter((a) => a.storeId === storeId && a.customerId === customerId && !a.deleted);
  }
  async findAddress(storeId: string, customerId: string, id: string) {
    return (
      this.addresses.find((a) => a.id === id && a.storeId === storeId && a.customerId === customerId && !a.deleted) ??
      null
    );
  }
  async createAddress(storeId: string, customerId: string, input: CustomerAddressInputRecord) {
    const count = this.addresses.filter((a) => a.storeId === storeId && a.customerId === customerId && !a.deleted).length;
    const makeDefault = count === 0 || input.isDefaultShipping === true;
    if (makeDefault) {
      for (const a of this.addresses) {
        if (a.storeId === storeId && a.customerId === customerId) {
          a.isDefaultShipping = false;
          a.isDefaultBilling = false;
        }
      }
    }
    const record = {
      id: this.id("adr"),
      storeId,
      customerId,
      deleted: false,
      addressName: input.addressName,
      fullName: input.fullName,
      phone: input.phone,
      city: input.city,
      district: input.district,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      postalCode: input.postalCode,
      isDefaultShipping: makeDefault,
      isDefaultBilling: makeDefault,
      billingType: input.billingType,
      tckn: input.tckn,
      companyName: input.companyName,
      taxOffice: input.taxOffice,
      taxNumber: input.taxNumber,
    };
    this.addresses.push(record);
    return record;
  }
  async updateAddress(storeId: string, customerId: string, id: string, input: CustomerAddressInputRecord) {
    const a = await this.findAddress(storeId, customerId, id);
    if (!a) return null;
    Object.assign(a, input);
    return a;
  }
  async softDeleteAddress(storeId: string, customerId: string, id: string) {
    const a = await this.findAddress(storeId, customerId, id);
    if (!a) return false;
    a.deleted = true;
    return true;
  }
  async setDefaultAddress(storeId: string, customerId: string, id: string) {
    const a = await this.findAddress(storeId, customerId, id);
    if (!a) return false;
    for (const x of this.addresses) {
      if (x.storeId === storeId && x.customerId === customerId) {
        x.isDefaultShipping = false;
        x.isDefaultBilling = false;
      }
    }
    a.isDefaultShipping = true;
    a.isDefaultBilling = true;
    return true;
  }
  async listIbans(storeId: string, customerId: string) {
    return this.ibans.filter((i) => i.storeId === storeId && i.customerId === customerId && !i.deleted);
  }
  async createIban(
    storeId: string,
    customerId: string,
    input: { accountHolderName: string; iban: string; isDefault: boolean },
  ) {
    const count = this.ibans.filter((i) => i.storeId === storeId && i.customerId === customerId && !i.deleted).length;
    const makeDefault = count === 0 || input.isDefault;
    if (makeDefault) {
      for (const i of this.ibans) if (i.storeId === storeId && i.customerId === customerId) i.isDefault = false;
    }
    const record = {
      id: this.id("iban"),
      storeId,
      customerId,
      deleted: false,
      accountHolderName: input.accountHolderName,
      iban: input.iban,
      isDefault: makeDefault,
    };
    this.ibans.push(record);
    return record;
  }
  async softDeleteIban(storeId: string, customerId: string, id: string) {
    const i = this.ibans.find((x) => x.id === id && x.storeId === storeId && x.customerId === customerId && !x.deleted);
    if (!i) return false;
    i.deleted = true;
    return true;
  }
  async setDefaultIban(storeId: string, customerId: string, id: string) {
    const i = this.ibans.find((x) => x.id === id && x.storeId === storeId && x.customerId === customerId && !x.deleted);
    if (!i) return false;
    for (const x of this.ibans) if (x.storeId === storeId && x.customerId === customerId) x.isDefault = false;
    i.isDefault = true;
    return true;
  }
  async listOrders(storeId: string, customerId: string) {
    return this.orders
      .filter((o) => o.storeId === storeId && o.customerId === customerId)
      .map((o) => ({
        orderNumber: o.order.orderNumber,
        status: o.order.status,
        paymentStatus: o.order.paymentStatus,
        fulfillmentStatus: o.order.fulfillmentStatus,
        currency: o.order.currency,
        totalAmount: o.order.totalAmount,
        createdAt: o.order.createdAt,
        lines: o.order.lines.map((line) => ({
          variantId: line.variantId,
          productSlug: line.productSlug,
          sku: line.sku,
          title: line.title,
          variantTitle: line.variantTitle,
          quantity: line.quantity,
        })),
      }));
  }
  async getOrderDetail(storeId: string, customerId: string, orderNumber: string) {
    const found = this.orders.find(
      (o) =>
        o.storeId === storeId &&
        o.customerId === customerId &&
        o.order.orderNumber === orderNumber,
    );
    if (!found) return null;
    const order = found.order;
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      createdAt: order.createdAt,
      placedAt: order.placedAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      subtotalAmount: order.subtotalAmount ?? order.totalAmount,
      discountAmount: order.discountAmount ?? 0,
      shippingAmount: order.shippingAmount ?? 0,
      taxAmount: order.taxAmount ?? 0,
      totalAmount: order.totalAmount,
      billingType: order.billingType ?? null,
      billingName: order.billingName ?? null,
      billingCompanyName: order.billingCompanyName ?? null,
      billingTaxOffice: order.billingTaxOffice ?? null,
      billingTaxId: order.billingTaxId ?? null,
      billingTaxNumber: order.billingTaxNumber ?? null,
      lines: order.lines.map((line) => ({
        variantId: line.variantId,
        productSlug: line.productSlug,
        sku: line.sku,
        title: line.title,
        variantTitle: line.variantTitle,
        quantity: line.quantity,
        unitPriceAmount: line.unitPriceAmount ?? order.totalAmount,
        totalAmount: (line.unitPriceAmount ?? order.totalAmount) * line.quantity,
      })),
      addresses: order.addresses ?? [],
      payment: order.payment ?? null,
      shipment: order.shipment
        ? {
            providerName: order.shipment.providerName,
            logoUrl: order.shipment.logoUrl,
            logoAlt: order.shipment.logoAlt,
            status: order.shipment.status,
            trackingNumber: order.shipment.trackingNumber,
            trackingUrl: order.shipment.trackingUrl,
            lastLocation:
              [...order.shipment.events]
                .reverse()
                .find((event) => event.location !== null)?.location ?? null,
            updatedAt: order.shipment.updatedAt,
            events: order.shipment.events
              .filter((event) => isCustomerVisibleShipmentEvent(event.eventType, event.location))
              .map((event) => ({
                eventType: event.eventType,
                statusText: event.statusText,
                location: event.location,
                occurredAt: event.occurredAt,
              })),
          }
        : null,
    };
  }
}

function makeApp() {
  const customers = new MemoryCustomerDataAccess();
  const app = createServer(config, { dataAccess, customerDataAccess: customers });
  return { app, customers };
}

const base = "/public/stores/demo-store/customer";

async function registerCustomer(
  app: ReturnType<typeof makeApp>["app"],
  identifier: string,
  password = "Passw0rd",
) {
  await app.inject({ method: "POST", url: `${base}/register/start`, payload: { identifier } });
  const res = await app.inject({
    method: "POST",
    url: `${base}/register/complete`,
    payload: {
      identifier,
      code: DEV_CODE,
      firstName: "Ada",
      lastName: "Lovelace",
      password,
      kvkkConsent: true,
      clarificationConsent: true,
    },
  });
  return res;
}

describe("api gateway · customer account (F3B.3)", () => {
  it("register start returns an OTP challenge without leaking the code", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: `${base}/register/start`,
      payload: { identifier: "ada@example.com" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.otpRequired).toBe(true);
    expect(body.channel).toBe("EMAIL");
    expect(body.maskedDestination).not.toContain("ada@example.com");
    expect(JSON.stringify(body)).not.toMatch(/"code"/);
  });

  it("rejects an invalid identifier", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: `${base}/register/start`,
      payload: { identifier: "not-an-email-or-phone" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_IDENTIFIER");
  });

  it("rejects a wrong OTP and accepts the dev code on verify", async () => {
    const { app } = makeApp();
    await app.inject({ method: "POST", url: `${base}/register/start`, payload: { identifier: "ada@example.com" } });
    const wrong = await app.inject({
      method: "POST",
      url: `${base}/register/verify`,
      payload: { identifier: "ada@example.com", code: "123456" },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe("INVALID_OTP");
    const ok = await app.inject({
      method: "POST",
      url: `${base}/register/verify`,
      payload: { identifier: "ada@example.com", code: DEV_CODE },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().verified).toBe(true);
  });

  it("rejects completion without required consents (KVKK / clarification)", async () => {
    const { app } = makeApp();
    await app.inject({ method: "POST", url: `${base}/register/start`, payload: { identifier: "ada@example.com" } });
    const res = await app.inject({
      method: "POST",
      url: `${base}/register/complete`,
      payload: {
        identifier: "ada@example.com",
        code: DEV_CODE,
        firstName: "Ada",
        lastName: "Lovelace",
        password: "Passw0rd",
        kvkkConsent: false,
        clarificationConsent: true,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("completes registration, returns a session, and me works with the token", async () => {
    const { app } = makeApp();
    const res = await registerCustomer(app, "ada@example.com");
    expect(res.statusCode).toBe(201);
    const { token, customer } = res.json();
    expect(token).toBeTruthy();
    expect(customer.emailVerified).toBe(true);
    expect(customer.status).toBe("ACTIVE");

    const me = await app.inject({
      method: "GET",
      url: `${base}/me`,
      headers: { "x-customer-session": token },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().customer.email).toBe("ada@example.com");
  });

  it("logs in with email and with GSM, and rejects bad credentials generically", async () => {
    const { app } = makeApp();
    await registerCustomer(app, "ada@example.com", "Passw0rd");
    await registerCustomer(app, "5321112233", "Passw0rd");

    const email = await app.inject({
      method: "POST",
      url: `${base}/login`,
      payload: { identifier: "ada@example.com", password: "Passw0rd" },
    });
    expect(email.statusCode).toBe(200);

    const phone = await app.inject({
      method: "POST",
      url: `${base}/login`,
      payload: { identifier: "0532 111 22 33", password: "Passw0rd" },
    });
    expect(phone.statusCode).toBe(200);

    const bad = await app.inject({
      method: "POST",
      url: `${base}/login`,
      payload: { identifier: "ada@example.com", password: "wrong" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs out: session is revoked and me returns 401 afterwards", async () => {
    const { app } = makeApp();
    const token = (await registerCustomer(app, "ada@example.com")).json().token;
    const out = await app.inject({
      method: "POST",
      url: `${base}/logout`,
      headers: { "x-customer-session": token },
    });
    expect(out.json().revoked).toBe(true);
    const me = await app.inject({ method: "GET", url: `${base}/me`, headers: { "x-customer-session": token } });
    expect(me.statusCode).toBe(401);
  });

  it("creates an address with TCKN validation and masks it in the response", async () => {
    const { app } = makeApp();
    const token = (await registerCustomer(app, "ada@example.com")).json().token;
    const addr = {
      addressName: "Ev",
      fullName: "Ada Lovelace",
      phone: "5321112233",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine1: "Moda Cad. 1",
      billingType: "INDIVIDUAL",
    };

    const missing = await app.inject({
      method: "POST",
      url: `${base}/addresses`,
      headers: { "x-customer-session": token },
      payload: addr,
    });
    expect(missing.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: `${base}/addresses`,
      headers: { "x-customer-session": token },
      payload: { ...addr, tckn: "10000000146" },
    });
    expect(ok.statusCode).toBe(201);
    const body = ok.json();
    expect(body.address.isDefaultShipping).toBe(true);
    expect(body.address.tcknMasked).toMatch(/\*+46$/);
    expect(JSON.stringify(body)).not.toContain("10000000146");
  });

  it("validates IBAN on create and never returns the full IBAN", async () => {
    const { app } = makeApp();
    const token = (await registerCustomer(app, "ada@example.com")).json().token;
    const invalid = await app.inject({
      method: "POST",
      url: `${base}/ibans`,
      headers: { "x-customer-session": token },
      payload: { accountHolderName: "Ada", iban: "TR00 0000" },
    });
    expect(invalid.statusCode).toBe(400);

    const validIban = "TR330006100519786457841326";
    const ok = await app.inject({
      method: "POST",
      url: `${base}/ibans`,
      headers: { "x-customer-session": token },
      payload: { accountHolderName: "Ada", iban: validIban },
    });
    expect(ok.statusCode).toBe(201);
    const body = ok.json();
    expect(body.iban.ibanMasked).toContain("****");
    expect(JSON.stringify(body)).not.toContain(validIban);
  });

  it("isolates account data across customers (ownership)", async () => {
    const { app } = makeApp();
    const tokenA = (await registerCustomer(app, "ada@example.com")).json().token;
    const tokenB = (await registerCustomer(app, "grace@example.com")).json().token;
    await app.inject({
      method: "POST",
      url: `${base}/addresses`,
      headers: { "x-customer-session": tokenA },
      payload: {
        addressName: "Ev",
        fullName: "Ada",
        phone: "5321112233",
        city: "İstanbul",
        district: "Kadıköy",
        addressLine1: "Moda 1",
      },
    });
    const listB = await app.inject({
      method: "GET",
      url: `${base}/addresses`,
      headers: { "x-customer-session": tokenB },
    });
    expect(listB.json().data).toHaveLength(0);
  });

  it("returns only the customer's own orders", async () => {
    const { app, customers } = makeApp();
    const res = await registerCustomer(app, "ada@example.com");
    const token = res.json().token;
    const customerId = customers.customers.find((c) => c.email === "ada@example.com")!.id;
    customers.seedOrder({
      customerId,
      orderNumber: "OS-1",
      status: "PLACED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "TRY",
      totalAmount: 1000,
      createdAt: new Date(),
      lines: [
        { variantId: "var_1", productSlug: "hoodie", sku: "HD-M", title: "Hoodie", variantTitle: "M", quantity: 1 },
      ],
    });
    customers.seedOrder({
      customerId: "someone_else",
      orderNumber: "OS-2",
      status: "PLACED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "TRY",
      totalAmount: 5000,
      createdAt: new Date(),
      lines: [
        { variantId: "var_2", productSlug: "other", sku: "OT-L", title: "Other", variantTitle: "L", quantity: 1 },
      ],
    });
    const orders = await app.inject({
      method: "GET",
      url: `${base}/orders`,
      headers: { "x-customer-session": token },
    });
    const data = orders.json().data;
    expect(data).toHaveLength(1);
    expect(data[0].orderNumber).toBe("OS-1");
    expect(data[0].fulfillmentStatus).toBe("UNFULFILLED");
    expect(data[0].lines[0]).toMatchObject({ variantId: "var_1", sku: "HD-M", productSlug: "hoodie" });
  });

  it("returns own order detail with safe payment fields only", async () => {
    const { app, customers } = makeApp();
    const token = (await registerCustomer(app, "ada@example.com")).json().token;
    const customerId = customers.customers.find((c) => c.email === "ada@example.com")!.id;
    customers.seedOrder({
      customerId,
      orderNumber: "OS-10",
      status: "FULFILLED",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      currency: "TRY",
      totalAmount: 12000,
      subtotalAmount: 10000,
      shippingAmount: 0,
      taxAmount: 2000,
      createdAt: new Date(),
      billingType: "INDIVIDUAL",
      billingName: "Ada Lovelace",
      billingTaxId: "12345678901",
      addresses: [
        {
          type: "SHIPPING",
          fullName: "Ada Lovelace",
          phone: "5321112233",
          countryCode: "TR",
          city: "İstanbul",
          district: "Kadıköy",
          addressLine1: "Moda 1",
          addressLine2: null,
          postalCode: "34710",
        },
      ],
      payment: {
        provider: "MOCK",
        method: "CARD",
        cardBrand: "VISA",
        cardLast4: "0008",
        installmentCount: 3,
        providerReference: "txn_abc123",
        threeDsApplied: true,
        paidAt: new Date(),
      },
      lines: [
        { variantId: "var_1", productSlug: "hoodie", sku: "HD-M", title: "Hoodie", variantTitle: "M", quantity: 2, unitPriceAmount: 5000 },
      ],
    });
    const res = await app.inject({
      method: "GET",
      url: `${base}/orders/OS-10`,
      headers: { "x-customer-session": token },
    });
    expect(res.statusCode).toBe(200);
    const order = res.json().order;
    expect(order.orderNumber).toBe("OS-10");
    expect(order.itemCount).toBe(2);
    expect(order.payment).toMatchObject({
      provider: "MOCK",
      cardBrand: "VISA",
      cardLast4: "0008",
      installmentCount: 3,
      transactionId: "txn_abc123",
      threeDsApplied: true,
    });
    // Fatura kimlik no MASKELİ; ham değer DÖNMEZ.
    expect(order.billing.taxId).not.toBe("12345678901");
    // PAN/CVC/token/hash hiçbir biçimde sızmaz.
    const raw = JSON.stringify(order);
    expect(raw).not.toContain("12345678901");
    expect(raw).not.toMatch(/cvc|accessToken|tokenHash|passwordHash/i);
    // Shipment seed edilmedi → kargo takip bloğu null (additive, opsiyonel).
    expect(order.shipment).toBeNull();
  });

  it("returns customer-safe shipment tracking (allowlist; no internal/secret fields)", async () => {
    const { app, customers } = makeApp();
    const token = (await registerCustomer(app, "ada@example.com")).json().token;
    const customerId = customers.customers.find((c) => c.email === "ada@example.com")!.id;
    customers.seedOrder({
      customerId,
      orderNumber: "OS-20",
      status: "FULFILLED",
      paymentStatus: "PAID",
      fulfillmentStatus: "FULFILLED",
      currency: "TRY",
      totalAmount: 8000,
      createdAt: new Date(),
      lines: [
        { variantId: "var_1", productSlug: "hoodie", sku: "HD-M", title: "Hoodie", variantTitle: "M", quantity: 1 },
      ],
      shipment: {
        providerName: "DHL eCommerce",
        logoUrl: "https://cdn.example.com/dhl.png",
        logoAlt: "DHL",
        status: "IN_TRANSIT",
        trackingNumber: "TRK-12345",
        trackingUrl: "https://track.example.com/TRK-12345",
        updatedAt: new Date(),
        events: [
          { eventType: "ORDER_CREATED", statusText: "Gönderi kaydı oluşturuldu", location: null, occurredAt: new Date() },
          // Operasyonel-iç event: konum yoksa müşteri timeline'ından DIŞLANIR.
          { eventType: "BARCODE_PENDING", statusText: "SECRET_BARCODE_JWT", location: null, occurredAt: new Date() },
          { eventType: "STATUS_CHANGED", statusText: "Taşıma sürecinde", location: "Ankara Aktarma Merkezi", occurredAt: new Date() },
        ],
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `${base}/orders/OS-20`,
      headers: { "x-customer-session": token },
    });
    expect(res.statusCode).toBe(200);
    const shipment = res.json().order.shipment;
    expect(shipment).toMatchObject({
      providerName: "DHL eCommerce",
      status: "IN_TRANSIT",
      trackingNumber: "TRK-12345",
      trackingUrl: "https://track.example.com/TRK-12345",
      lastLocation: "Ankara Aktarma Merkezi",
    });
    // Müşteri-görünür filtre: iç BARCODE_PENDING (konumsuz) dışlanır → 2 event.
    expect(shipment.events).toHaveLength(2);
    expect(shipment.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "ORDER_CREATED",
      "STATUS_CHANGED",
    ]);
    // İç/secret alanlar ASLA sızmaz (barkod/ZPL, labelUrl, externalId, referenceId, raw).
    const raw = JSON.stringify(shipment);
    expect(raw).not.toContain("SECRET_BARCODE_JWT");
    expect(raw).not.toMatch(/barcode|labelUrl|externalOrderId|externalShipmentId|referenceId|rawSafeJson/i);
  });

  it("filters shipment events to customer-visible ones (ADR-045)", () => {
    // Operasyonel-iç tipler (konumsuz) gizlenir.
    expect(isCustomerVisibleShipmentEvent("BARCODE_CREATED", null)).toBe(false);
    expect(isCustomerVisibleShipmentEvent("BARCODE_PENDING", null)).toBe(false);
    expect(isCustomerVisibleShipmentEvent("WEBHOOK_RECEIVED", null)).toBe(false);
    expect(isCustomerVisibleShipmentEvent("CREATED", null)).toBe(false);
    // Anlamlı tipler gösterilir.
    expect(isCustomerVisibleShipmentEvent("ORDER_CREATED", null)).toBe(true);
    expect(isCustomerVisibleShipmentEvent("STATUS_CHANGED", null)).toBe(true);
    expect(isCustomerVisibleShipmentEvent("MANUAL_TRACKING", null)).toBe(true);
    // Konum taşıyan her event anlamlıdır (işlem noktası) → gösterilir.
    expect(isCustomerVisibleShipmentEvent("WEBHOOK_RECEIVED", "İzmir")).toBe(true);
  });

  it("does not expose another customer's order detail (404)", async () => {
    const { app, customers } = makeApp();
    const tokenA = (await registerCustomer(app, "ada@example.com")).json().token;
    await registerCustomer(app, "grace@example.com");
    const graceId = customers.customers.find((c) => c.email === "grace@example.com")!.id;
    customers.seedOrder({
      customerId: graceId,
      orderNumber: "OS-99",
      status: "PLACED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "TRY",
      totalAmount: 4000,
      createdAt: new Date(),
      lines: [
        { variantId: "var_x", productSlug: "secret", sku: "SC-1", title: "Secret", variantTitle: "—", quantity: 1 },
      ],
    });
    const res = await app.inject({
      method: "GET",
      url: `${base}/orders/OS-99`,
      headers: { "x-customer-session": tokenA },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires a customer session to list orders (guest 401)", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/orders` });
    expect(res.statusCode).toBe(401);
  });
});
