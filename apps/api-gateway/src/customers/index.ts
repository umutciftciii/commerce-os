/**
 * F3B.3 — Storefront musteri hesabi domaini (ADR-032). Tek musteri kavrami:
 * mevcut store-scoped `Customer` hem CRM hem storefront uyelik hesabidir. Bu
 * modul auth (kayit/giris/otp/oturum), profil, sifre, iletisim tercihi, adres
 * defteri ve IBAN uclarini saglar.
 *
 * Guvenlik kurallari:
 *  - Plain sifre/OTP ASLA saklanmaz veya loglanmaz (yalnizca scrypt/sha256 hash).
 *  - Oturum: raw token DB'de tutulmaz; sha256 tokenHash. Storefront httpOnly
 *    cookie -> gateway'e `x-customer-session` header'i ile server-to-server.
 *  - Store izolasyonu: oturum storeId ile baglidir; tum sorgular store+customer
 *    scoped. Baska musterinin order/address/account verisi gorunmez.
 *  - TCKN/VKN/IBAN response'larda MASKELI; tam deger event/log metadata'ya yazilmaz.
 *  - Gercek SMS/e-posta saglayici YOK; OTP teslimat provider-ready dev/mock.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hashPassword, verifyPassword } from "@commerce-os/auth";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
// Faz 3/Dilim 6b — siparis satiri thumbnail'i icin paylasilan kapak URL haritasi
// (tek allowlist noktasi; N+1'siz). listProductImages DI ile deps'ten gelir.
import { buildProductCoverUrlMap, type ListProductImagesFn } from "../media/cover.js";
import type {
  BillingType,
  CustomerCredentialTokenPurpose,
  CustomerGender,
  CustomerOtpChannel,
  CustomerOtpPurpose,
  CustomerStatus,
  ShippingProviderType,
} from "@prisma/client";
import {
  classifyIdentifier,
  customerActivateRequestSchema,
  customerActivateResponseSchema,
  customerAddressInputSchema,
  customerAddressListResponseSchema,
  customerCommunicationPreferenceSchema,
  customerIbanInputSchema,
  customerIbanListResponseSchema,
  customerLoginRequestSchema,
  customerLogoutResponseSchema,
  customerMeResponseSchema,
  customerOrderListResponseSchema,
  customerOrderDetailResponseSchema,
  pickOrderShipmentStatus,
  customerOtpChallengeResponseSchema,
  customerOtpVerifyRequestSchema,
  customerPasswordChangeRequestSchema,
  customerProfileUpdateRequestSchema,
  customerRegisterCompleteRequestSchema,
  customerRegisterStartRequestSchema,
  customerSessionResponseSchema,
  digitsOnly,
  isValidTaxNumber,
  isValidTckn,
  maskIban,
  maskTaxId,
  normalizeIban,
  normalizeTrPhone,
  storeAdminCredentialTokenResponseSchema,
  storeAdminCustomerCreateRequestSchema,
  storeAdminCustomerCreateResponseSchema,
  storeAdminCustomerDetailResponseSchema,
  storeAdminCustomerUpdateRequestSchema,
  storeAdminRevokeSessionsResponseSchema,
} from "@commerce-os/contracts";

/* ── Tipler ───────────────────────────────────────────────────────────────── */

export interface CustomerAuthRecord {
  id: string;
  storeId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  gender: CustomerGender | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: CustomerStatus;
}

export interface CustomerOtpRecord {
  id: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  channel: CustomerOtpChannel;
  createdAt: Date;
}

export interface CustomerSessionRecord {
  id: string;
  storeId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  customer: CustomerAuthRecord;
}

export interface CustomerAddressRecord {
  id: string;
  addressName: string;
  fullName: string;
  phone: string | null;
  city: string;
  district: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
  billingType: BillingType | null;
  tckn: string | null;
  companyName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
}

export interface CustomerIbanRecord {
  id: string;
  accountHolderName: string;
  iban: string;
  isDefault: boolean;
}

export interface CustomerAddressInputRecord {
  addressName: string;
  fullName: string;
  phone: string | null;
  city: string;
  district: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  isDefaultShipping?: boolean;
  billingType: BillingType | null;
  tckn: string | null;
  companyName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
}

/* ── Sipariş okuma kayıtları (TODO-079) ───────────────────────────────────── */

export interface CustomerOrderLineRecord {
  // Dilim 6b — güncel kapak görselini çözmek için iç alan; contract DTO'suna
  // SIZMAZ (serialize'da imageUrl'e çevrilip atılır, kendisi allowlist'te yok).
  productId: string;
  variantId: string;
  productSlug: string;
  sku: string;
  title: string;
  variantTitle: string;
  quantity: number;
}

export interface CustomerOrderRecord {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  totalAmount: number;
  createdAt: Date;
  // TODO-135 — Temsili kargo durumu (rozet için); shipment yoksa null.
  shipmentStatus: string | null;
  lines: CustomerOrderLineRecord[];
}

export interface CustomerOrderDetailLineRecord extends CustomerOrderLineRecord {
  unitPriceAmount: number;
  totalAmount: number;
}

export interface CustomerOrderAddressRecord {
  type: string;
  fullName: string;
  phone: string | null;
  countryCode: string;
  city: string;
  district: string | null;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
}

/** Ödeme GÜVENLİ alanları; full PAN/CVC/token/hash ASLA taşınmaz. */
export interface CustomerOrderPaymentRecord {
  provider: string;
  method: string;
  cardBrand: string | null;
  cardLast4: string | null;
  installmentCount: number;
  providerReference: string | null;
  threeDsApplied: boolean;
  paidAt: Date | null;
}

/**
 * TODO-117 — Müşteri-facing kargo takip kaydı. Yalnız müşteri-güvenli alanlar;
 * secret/iç alan (barkod/ZPL, labelUrl, rawSafeJson, externalId, referenceId,
 * alıcı PII) TAŞIMAZ. Konum = "işlem noktası" (kesin varış değil; ADR-045).
 */
export interface CustomerOrderShipmentEventRecord {
  eventType: string;
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
}

export interface CustomerOrderShipmentRecord {
  providerName: string;
  logoUrl: string | null;
  logoAlt: string | null;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  lastLocation: string | null;
  updatedAt: Date;
  events: CustomerOrderShipmentEventRecord[];
}

export interface CustomerOrderDetailRecord {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  createdAt: Date;
  placedAt: Date | null;
  cancelledAt: Date | null;
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  // TODO-125 — Secilen kargo saglayici/secenek snapshot'i (siparis anindan).
  shippingCurrency: string | null;
  shippingProvider: ShippingProviderType | null;
  shippingProviderName: string | null;
  shippingRatePlanName: string | null;
  shippingLogoUrl: string | null;
  shippingEtaText: string | null;
  billingType: BillingType | null;
  billingName: string | null;
  billingCompanyName: string | null;
  billingTaxOffice: string | null;
  billingTaxId: string | null;
  billingTaxNumber: string | null;
  lines: CustomerOrderDetailLineRecord[];
  addresses: CustomerOrderAddressRecord[];
  payment: CustomerOrderPaymentRecord | null;
  shipment: CustomerOrderShipmentRecord | null;
}

const customerAuthSelect = {
  id: true,
  storeId: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  gender: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  status: true,
} satisfies Prisma.CustomerSelect;

const addressSelect = {
  id: true,
  addressName: true,
  fullName: true,
  phone: true,
  city: true,
  district: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  isDefaultShipping: true,
  isDefaultBilling: true,
  billingType: true,
  tckn: true,
  companyName: true,
  taxOffice: true,
  taxNumber: true,
} satisfies Prisma.CustomerAddressSelect;

/* ── Data access port ─────────────────────────────────────────────────────── */

export interface CustomerDataAccess {
  findByEmail(storeId: string, email: string): Promise<CustomerAuthRecord | null>;
  findByPhone(storeId: string, phone: string): Promise<CustomerAuthRecord | null>;
  findById(storeId: string, id: string): Promise<CustomerAuthRecord | null>;
  createPending(
    storeId: string,
    input: { email: string | null; phone: string | null },
  ): Promise<CustomerAuthRecord>;
  hasCredential(customerId: string): Promise<boolean>;
  findCredentialHash(customerId: string): Promise<string | null>;
  setCredential(storeId: string, customerId: string, passwordHash: string): Promise<void>;
  updateCredential(customerId: string, passwordHash: string): Promise<void>;
  updateProfile(
    storeId: string,
    customerId: string,
    input: { firstName: string; lastName: string; birthDate: Date | null; gender: CustomerGender | null },
  ): Promise<CustomerAuthRecord>;
  activateAndVerifyContact(
    storeId: string,
    customerId: string,
    channel: CustomerOtpChannel,
    profile: { firstName: string; lastName: string },
  ): Promise<CustomerAuthRecord>;
  createOtp(input: {
    storeId: string;
    customerId: string;
    purpose: CustomerOtpPurpose;
    channel: CustomerOtpChannel;
    destination: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  latestOtp(
    storeId: string,
    customerId: string,
    purpose: CustomerOtpPurpose,
  ): Promise<CustomerOtpRecord | null>;
  bumpOtpAttempt(id: string): Promise<void>;
  consumeOtp(id: string): Promise<void>;
  createSession(input: {
    storeId: string;
    customerId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<CustomerSessionRecord | null>;
  revokeSession(id: string): Promise<boolean>;
  getCommPref(
    storeId: string,
    customerId: string,
  ): Promise<{ smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean }>;
  upsertCommPref(
    storeId: string,
    customerId: string,
    input: { smsEnabled: boolean; emailEnabled: boolean; phoneEnabled: boolean },
  ): Promise<void>;
  listAddresses(storeId: string, customerId: string): Promise<CustomerAddressRecord[]>;
  findAddress(storeId: string, customerId: string, id: string): Promise<CustomerAddressRecord | null>;
  createAddress(
    storeId: string,
    customerId: string,
    input: CustomerAddressInputRecord,
  ): Promise<CustomerAddressRecord>;
  updateAddress(
    storeId: string,
    customerId: string,
    id: string,
    input: CustomerAddressInputRecord,
  ): Promise<CustomerAddressRecord | null>;
  softDeleteAddress(storeId: string, customerId: string, id: string): Promise<boolean>;
  setDefaultAddress(storeId: string, customerId: string, id: string): Promise<boolean>;
  listIbans(storeId: string, customerId: string): Promise<CustomerIbanRecord[]>;
  createIban(
    storeId: string,
    customerId: string,
    input: { accountHolderName: string; iban: string; isDefault: boolean },
  ): Promise<CustomerIbanRecord>;
  softDeleteIban(storeId: string, customerId: string, id: string): Promise<boolean>;
  setDefaultIban(storeId: string, customerId: string, id: string): Promise<boolean>;
  listOrders(storeId: string, customerId: string): Promise<CustomerOrderRecord[]>;
  // TODO-079 — Hesabım > Sipariş detayı. YALNIZ kendi siparişi (store+customer
  // scoped). Başka müşterinin siparişi eşleşmez → null → route 404.
  getOrderDetail(
    storeId: string,
    customerId: string,
    orderNumber: string,
  ): Promise<CustomerOrderDetailRecord | null>;
  // F3B.3 store-admin — müşteri detay/yönetim. createdAt + üyelik (hasCredential) ile.
  adminFindDetail(
    storeId: string,
    customerId: string,
  ): Promise<(CustomerAuthRecord & { createdAt: Date; hasCredential: boolean }) | null>;
  // Admin temel bilgi/durum güncellemesi. E-posta/telefon store-scope unique; çakışırsa
  // sentinel döner. E-posta/telefon değişirse ilgili verifiedAt null'a çekilir.
  adminUpdateCustomer(
    storeId: string,
    customerId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      status?: CustomerStatus;
      birthDate?: Date | null;
      gender?: CustomerGender | null;
    },
  ): Promise<CustomerAuthRecord | "NOT_FOUND" | "EMAIL_TAKEN" | "PHONE_TAKEN">;
  // TODO-087 store-admin — müşteri oluşturma. E-posta/telefon store-scope unique;
  // çakışırsa sentinel döner. status admin tarafından set edilir (default ACTIVE).
  adminCreateCustomer(
    storeId: string,
    input: {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      status: CustomerStatus;
    },
  ): Promise<CustomerAuthRecord | "EMAIL_TAKEN" | "PHONE_TAKEN">;
  // TODO-087 — admin tetikli credential token. Yalnız tokenHash saklanır.
  createCredentialToken(input: {
    storeId: string;
    customerId: string;
    purpose: CustomerCredentialTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string;
  }): Promise<void>;
  findCredentialTokenByHash(tokenHash: string): Promise<CustomerCredentialTokenRecord | null>;
  consumeCredentialToken(id: string): Promise<boolean>;
  setCustomerActive(storeId: string, customerId: string): Promise<void>;
  getCredentialMeta(customerId: string): Promise<{ passwordChangedAt: Date } | null>;
  countActiveSessions(storeId: string, customerId: string): Promise<number>;
  revokeAllSessions(storeId: string, customerId: string): Promise<number>;
}

export interface CustomerCredentialTokenRecord {
  id: string;
  storeId: string;
  customerId: string;
  purpose: CustomerCredentialTokenPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
}

export function createPrismaCustomerDataAccess(): CustomerDataAccess {
  return {
    async findByEmail(storeId, email) {
      return prisma.customer.findFirst({ where: { storeId, email }, select: customerAuthSelect });
    },
    async findByPhone(storeId, phone) {
      return prisma.customer.findFirst({ where: { storeId, phone }, select: customerAuthSelect });
    },
    async findById(storeId, id) {
      return prisma.customer.findFirst({ where: { id, storeId }, select: customerAuthSelect });
    },
    async createPending(storeId, input) {
      return prisma.customer.create({
        data: { storeId, email: input.email, phone: input.phone, status: "PASSIVE" },
        select: customerAuthSelect,
      });
    },
    async hasCredential(customerId) {
      const found = await prisma.customerCredential.findUnique({
        where: { customerId },
        select: { id: true },
      });
      return Boolean(found);
    },
    async findCredentialHash(customerId) {
      const found = await prisma.customerCredential.findUnique({
        where: { customerId },
        select: { passwordHash: true },
      });
      return found?.passwordHash ?? null;
    },
    async setCredential(storeId, customerId, passwordHash) {
      await prisma.customerCredential.upsert({
        where: { customerId },
        create: { storeId, customerId, passwordHash },
        update: { passwordHash, passwordChangedAt: new Date() },
      });
    },
    async updateCredential(customerId, passwordHash) {
      await prisma.customerCredential.update({
        where: { customerId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
    },
    async updateProfile(storeId, customerId, input) {
      return prisma.customer.update({
        where: { id: customerId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate,
          gender: input.gender,
        },
        select: customerAuthSelect,
      });
    },
    async activateAndVerifyContact(storeId, customerId, channel, profile) {
      const now = new Date();
      return prisma.customer.update({
        where: { id: customerId },
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          status: "ACTIVE",
          ...(channel === "EMAIL" ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }),
        },
        select: customerAuthSelect,
      });
    },
    async createOtp(input) {
      await prisma.customerOtpVerification.create({
        data: {
          storeId: input.storeId,
          customerId: input.customerId,
          purpose: input.purpose,
          channel: input.channel,
          destination: input.destination,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
        },
      });
    },
    async latestOtp(storeId, customerId, purpose) {
      return prisma.customerOtpVerification.findFirst({
        where: { storeId, customerId, purpose, consumedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          codeHash: true,
          expiresAt: true,
          consumedAt: true,
          attemptCount: true,
          channel: true,
          createdAt: true,
        },
      });
    },
    async bumpOtpAttempt(id) {
      await prisma.customerOtpVerification.update({
        where: { id },
        data: { attemptCount: { increment: 1 } },
      });
    },
    async consumeOtp(id) {
      await prisma.customerOtpVerification.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
    },
    async createSession(input) {
      await prisma.customerSession.create({
        data: {
          storeId: input.storeId,
          customerId: input.customerId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          userAgent: input.userAgent ?? null,
          ipAddress: input.ipAddress ?? null,
        },
      });
    },
    async findSessionByTokenHash(tokenHash) {
      const session = await prisma.customerSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          storeId: true,
          expiresAt: true,
          revokedAt: true,
          customer: { select: customerAuthSelect },
        },
      });
      return session ?? null;
    },
    async revokeSession(id) {
      const result = await prisma.customerSession.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count > 0;
    },
    async getCommPref(storeId, customerId) {
      const pref = await prisma.customerCommunicationPreference.findUnique({
        where: { customerId },
        select: { smsEnabled: true, emailEnabled: true, phoneEnabled: true },
      });
      return pref ?? { smsEnabled: false, emailEnabled: true, phoneEnabled: false };
    },
    async upsertCommPref(storeId, customerId, input) {
      await prisma.customerCommunicationPreference.upsert({
        where: { customerId },
        create: { storeId, customerId, ...input },
        update: input,
      });
    },
    async listAddresses(storeId, customerId) {
      return prisma.customerAddress.findMany({
        where: { storeId, customerId, deletedAt: null },
        orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "asc" }],
        select: addressSelect,
      });
    },
    async findAddress(storeId, customerId, id) {
      return prisma.customerAddress.findFirst({
        where: { id, storeId, customerId, deletedAt: null },
        select: addressSelect,
      });
    },
    async createAddress(storeId, customerId, input) {
      const count = await prisma.customerAddress.count({
        where: { storeId, customerId, deletedAt: null },
      });
      const makeDefault = count === 0 || input.isDefaultShipping === true;
      return prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.customerAddress.updateMany({
            where: { storeId, customerId },
            data: { isDefaultShipping: false, isDefaultBilling: false },
          });
        }
        return tx.customerAddress.create({
          data: {
            storeId,
            customerId,
            type: "SHIPPING",
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
          },
          select: addressSelect,
        });
      });
    },
    async updateAddress(storeId, customerId, id, input) {
      const existing = await prisma.customerAddress.findFirst({
        where: { id, storeId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return null;
      return prisma.$transaction(async (tx) => {
        if (input.isDefaultShipping === true) {
          await tx.customerAddress.updateMany({
            where: { storeId, customerId },
            data: { isDefaultShipping: false, isDefaultBilling: false },
          });
        }
        return tx.customerAddress.update({
          where: { id },
          data: {
            addressName: input.addressName,
            fullName: input.fullName,
            phone: input.phone,
            city: input.city,
            district: input.district,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            postalCode: input.postalCode,
            ...(input.isDefaultShipping === true
              ? { isDefaultShipping: true, isDefaultBilling: true }
              : {}),
            billingType: input.billingType,
            tckn: input.tckn,
            companyName: input.companyName,
            taxOffice: input.taxOffice,
            taxNumber: input.taxNumber,
          },
          select: addressSelect,
        });
      });
    },
    async softDeleteAddress(storeId, customerId, id) {
      const result = await prisma.customerAddress.updateMany({
        where: { id, storeId, customerId, deletedAt: null },
        data: { deletedAt: new Date(), isDefaultShipping: false, isDefaultBilling: false },
      });
      return result.count > 0;
    },
    async setDefaultAddress(storeId, customerId, id) {
      const target = await prisma.customerAddress.findFirst({
        where: { id, storeId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!target) return false;
      await prisma.$transaction([
        prisma.customerAddress.updateMany({
          where: { storeId, customerId },
          data: { isDefaultShipping: false, isDefaultBilling: false },
        }),
        prisma.customerAddress.update({
          where: { id },
          data: { isDefaultShipping: true, isDefaultBilling: true },
        }),
      ]);
      return true;
    },
    async listIbans(storeId, customerId) {
      return prisma.customerIban.findMany({
        where: { storeId, customerId, deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, accountHolderName: true, iban: true, isDefault: true },
      });
    },
    async createIban(storeId, customerId, input) {
      const count = await prisma.customerIban.count({
        where: { storeId, customerId, deletedAt: null },
      });
      const makeDefault = count === 0 || input.isDefault;
      return prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.customerIban.updateMany({
            where: { storeId, customerId },
            data: { isDefault: false },
          });
        }
        return tx.customerIban.create({
          data: {
            storeId,
            customerId,
            accountHolderName: input.accountHolderName,
            iban: input.iban,
            isDefault: makeDefault,
          },
          select: { id: true, accountHolderName: true, iban: true, isDefault: true },
        });
      });
    },
    async softDeleteIban(storeId, customerId, id) {
      const result = await prisma.customerIban.updateMany({
        where: { id, storeId, customerId, deletedAt: null },
        data: { deletedAt: new Date(), isDefault: false },
      });
      return result.count > 0;
    },
    async setDefaultIban(storeId, customerId, id) {
      const target = await prisma.customerIban.findFirst({
        where: { id, storeId, customerId, deletedAt: null },
        select: { id: true },
      });
      if (!target) return false;
      await prisma.$transaction([
        prisma.customerIban.updateMany({
          where: { storeId, customerId },
          data: { isDefault: false },
        }),
        prisma.customerIban.update({ where: { id }, data: { isDefault: true } }),
      ]);
      return true;
    },
    async listOrders(storeId, customerId) {
      const orders = await prisma.order.findMany({
        where: { storeId, customerId },
        orderBy: { createdAt: "desc" },
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          currency: true,
          totalAmount: true,
          createdAt: true,
          lines: {
            select: {
              productId: true, // Dilim 6b — güncel kapak görseli çözümü (iç; DTO'ya sızmaz)
              variantId: true,
              sku: true,
              title: true,
              variantTitle: true,
              quantity: true,
              product: { select: { slug: true } },
            },
          },
          // TODO-135 — Liste rozetinin kargo hazırlık durumunu yansıtması için TEMSİLİ
          // shipment durumu (yalnız DURUM; müşteri-güvenli, statusText/iç alan yok).
          shipments: { select: { status: true } },
        },
      });
      return orders.map((order) => ({
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        currency: order.currency,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        // TODO-135 — Birden çok gönderi olabilir → en ileri temsili durum; yoksa null.
        shipmentStatus: pickOrderShipmentStatus(order.shipments.map((s) => s.status)),
        lines: order.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productSlug: line.product.slug,
          sku: line.sku,
          title: line.title,
          variantTitle: line.variantTitle,
          quantity: line.quantity,
        })),
      }));
    },
    async getOrderDetail(storeId, customerId, orderNumber) {
      // Ownership: store + customer + orderNumber birlikte eşleşmeli; başka
      // müşterinin siparişi customerId ile EŞLEŞMEZ → null → route 404.
      const order = await prisma.order.findFirst({
        where: { storeId, customerId, orderNumber },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          currency: true,
          createdAt: true,
          placedAt: true,
          cancelledAt: true,
          subtotalAmount: true,
          discountAmount: true,
          shippingAmount: true,
          taxAmount: true,
          totalAmount: true,
          // TODO-125 — Secilen kargo saglayici/secenek snapshot'i.
          shippingCurrency: true,
          shippingProvider: true,
          shippingProviderName: true,
          shippingRatePlanName: true,
          shippingLogoUrl: true,
          shippingEtaText: true,
          billingType: true,
          billingName: true,
          billingCompanyName: true,
          billingTaxOffice: true,
          billingTaxId: true,
          billingTaxNumber: true,
          lines: {
            select: {
              productId: true, // Dilim 6b — güncel kapak görseli çözümü (iç; DTO'ya sızmaz)
              variantId: true,
              sku: true,
              title: true,
              variantTitle: true,
              quantity: true,
              unitPriceAmount: true,
              totalAmount: true,
              product: { select: { slug: true } },
            },
          },
          addresses: {
            select: {
              type: true,
              fullName: true,
              phone: true,
              countryCode: true,
              city: true,
              district: true,
              addressLine1: true,
              addressLine2: true,
              postalCode: true,
            },
          },
          // Ödeme yöntemi özeti: GÜVENLİ alanlar; gerçekten ödenen (paidAt dolu)
          // en son denemeyi tercih ederiz. accessTokenHash/PAN/CVC SELECT EDİLMEZ.
          paymentAttempts: {
            orderBy: { createdAt: "desc" },
            select: {
              provider: true,
              method: true,
              cardBrand: true,
              cardLast4: true,
              installmentCount: true,
              providerReference: true,
              threeDsApplied: true,
              paidAt: true,
            },
          },
        },
      });
      if (!order) return null;
      const paid = order.paymentAttempts.find((attempt) => attempt.paidAt !== null);
      const payment = paid ?? null;

      // TODO-117 — Kargo takip özeti (en güncel shipment). Yalnız müşteri-güvenli
      // alanlar SELECT edilir; barkod/ZPL/labelUrl/rawSafeJson/externalId/alıcı PII
      // ÇEKİLMEZ. Operasyonel-iç event'ler (barkod/webhook) müşteri timeline'ından
      // dışlanır; konum "işlem noktası" olarak gösterilir (ADR-045).
      const shipmentRow = await prisma.shipment.findFirst({
        where: { storeId, orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          trackingNumber: true,
          trackingUrl: true,
          updatedAt: true,
          providerConfig: { select: { displayName: true, logoUrl: true, logoAlt: true } },
          events: {
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
            select: {
              eventType: true,
              statusText: true,
              location: true,
              occurredAt: true,
            },
          },
        },
      });
      const shipment: CustomerOrderShipmentRecord | null = shipmentRow
        ? {
            providerName: shipmentRow.providerConfig.displayName,
            logoUrl: shipmentRow.providerConfig.logoUrl,
            logoAlt: shipmentRow.providerConfig.logoAlt,
            status: shipmentRow.status,
            trackingNumber: shipmentRow.trackingNumber,
            trackingUrl: shipmentRow.trackingUrl,
            lastLocation:
              [...shipmentRow.events]
                .reverse()
                .find((event) => event.location !== null)?.location ?? null,
            updatedAt: shipmentRow.updatedAt,
            events: dedupeConsecutiveShipmentEvents(
              shipmentRow.events.filter((event) =>
                isCustomerVisibleShipmentEvent(event.eventType, event.location),
              ),
            ).map((event) => ({
              eventType: event.eventType,
              statusText: customerSafeShipmentEventStatusText(event.eventType, event.statusText),
              location: event.location,
              occurredAt: event.occurredAt,
            })),
          }
        : null;

      return {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        currency: order.currency,
        createdAt: order.createdAt,
        placedAt: order.placedAt,
        cancelledAt: order.cancelledAt,
        subtotalAmount: order.subtotalAmount,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        taxAmount: order.taxAmount,
        totalAmount: order.totalAmount,
        shippingCurrency: order.shippingCurrency,
        shippingProvider: order.shippingProvider,
        shippingProviderName: order.shippingProviderName,
        shippingRatePlanName: order.shippingRatePlanName,
        shippingLogoUrl: order.shippingLogoUrl,
        shippingEtaText: order.shippingEtaText,
        billingType: order.billingType,
        billingName: order.billingName,
        billingCompanyName: order.billingCompanyName,
        billingTaxOffice: order.billingTaxOffice,
        billingTaxId: order.billingTaxId,
        billingTaxNumber: order.billingTaxNumber,
        lines: order.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productSlug: line.product.slug,
          sku: line.sku,
          title: line.title,
          variantTitle: line.variantTitle,
          quantity: line.quantity,
          unitPriceAmount: line.unitPriceAmount,
          totalAmount: line.totalAmount,
        })),
        addresses: order.addresses.map((address) => ({
          type: address.type,
          fullName: address.fullName,
          phone: address.phone,
          countryCode: address.countryCode,
          city: address.city,
          district: address.district,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          postalCode: address.postalCode,
        })),
        payment: payment
          ? {
              provider: payment.provider,
              method: payment.method,
              cardBrand: payment.cardBrand,
              cardLast4: payment.cardLast4,
              installmentCount: payment.installmentCount,
              providerReference: payment.providerReference,
              threeDsApplied: payment.threeDsApplied,
              paidAt: payment.paidAt,
            }
          : null,
        shipment,
      };
    },
    async adminFindDetail(storeId, customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
        select: { ...customerAuthSelect, createdAt: true, credential: { select: { id: true } } },
      });
      if (!customer) return null;
      const { credential, ...rest } = customer;
      return { ...rest, hasCredential: credential !== null };
    },
    async adminUpdateCustomer(storeId, customerId, input) {
      const current = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
        select: { id: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true },
      });
      if (!current) return "NOT_FOUND";

      const data: Prisma.CustomerUpdateInput = {};
      if (input.firstName !== undefined) data.firstName = input.firstName;
      if (input.lastName !== undefined) data.lastName = input.lastName;
      if (input.birthDate !== undefined) data.birthDate = input.birthDate;
      if (input.gender !== undefined) data.gender = input.gender;
      if (input.status !== undefined) data.status = input.status;

      // E-posta değişimi: store-scope unique + admin doğrulama override etmez.
      if (input.email !== undefined && input.email !== current.email) {
        if (input.email) {
          const clash = await prisma.customer.findFirst({
            where: { storeId, email: input.email, NOT: { id: customerId } },
            select: { id: true },
          });
          if (clash) return "EMAIL_TAKEN";
        }
        data.email = input.email;
        data.emailVerifiedAt = null;
      }
      // Telefon değişimi: store-scope unique + admin doğrulama override etmez.
      if (input.phone !== undefined && input.phone !== current.phone) {
        if (input.phone) {
          const clash = await prisma.customer.findFirst({
            where: { storeId, phone: input.phone, NOT: { id: customerId } },
            select: { id: true },
          });
          if (clash) return "PHONE_TAKEN";
        }
        data.phone = input.phone;
        data.phoneVerifiedAt = null;
      }

      try {
        return await prisma.customer.update({
          where: { id: customerId },
          data,
          select: customerAuthSelect,
        });
      } catch (error) {
        // Yarış durumunda DB unique constraint son güvenlik ağı.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const target = (error.meta?.target as string[] | undefined)?.join(",") ?? "";
          return target.includes("phone") ? "PHONE_TAKEN" : "EMAIL_TAKEN";
        }
        throw error;
      }
    },
    async adminCreateCustomer(storeId, input) {
      // Store-scope unique ön-kontrol; yarış için DB unique constraint son güvenlik ağı.
      if (input.email) {
        const clash = await prisma.customer.findFirst({
          where: { storeId, email: input.email },
          select: { id: true },
        });
        if (clash) return "EMAIL_TAKEN";
      }
      if (input.phone) {
        const clash = await prisma.customer.findFirst({
          where: { storeId, phone: input.phone },
          select: { id: true },
        });
        if (clash) return "PHONE_TAKEN";
      }
      try {
        return await prisma.customer.create({
          data: {
            storeId,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            status: input.status,
          },
          select: customerAuthSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const target = (error.meta?.target as string[] | undefined)?.join(",") ?? "";
          return target.includes("phone") ? "PHONE_TAKEN" : "EMAIL_TAKEN";
        }
        throw error;
      }
    },
    async createCredentialToken(input) {
      await prisma.customerCredentialToken.create({
        data: {
          storeId: input.storeId,
          customerId: input.customerId,
          purpose: input.purpose,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdByUserId: input.createdByUserId,
        },
      });
    },
    async findCredentialTokenByHash(tokenHash) {
      return prisma.customerCredentialToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          storeId: true,
          customerId: true,
          purpose: true,
          expiresAt: true,
          consumedAt: true,
        },
      });
    },
    async consumeCredentialToken(id) {
      const result = await prisma.customerCredentialToken.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return result.count > 0;
    },
    async setCustomerActive(storeId, customerId) {
      await prisma.customer.updateMany({
        where: { id: customerId, storeId },
        data: { status: "ACTIVE" },
      });
    },
    async getCredentialMeta(customerId) {
      return prisma.customerCredential.findUnique({
        where: { customerId },
        select: { passwordChangedAt: true },
      });
    },
    async countActiveSessions(storeId, customerId) {
      return prisma.customerSession.count({
        where: { storeId, customerId, revokedAt: null, expiresAt: { gt: new Date() } },
      });
    },
    async revokeAllSessions(storeId, customerId) {
      const result = await prisma.customerSession.updateMany({
        where: { storeId, customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count;
    },
  };
}

/** "Ad Soyad" tek girdisini ad/soyad'a böler (son kelime soyad). */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? fullName.trim(), lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/* ── Serializers (guvenli/maskeli response) ───────────────────────────────── */

function toAccount(rec: CustomerAuthRecord) {
  return {
    id: rec.id,
    email: rec.email,
    phone: rec.phone,
    firstName: rec.firstName,
    lastName: rec.lastName,
    birthDate: rec.birthDate ? rec.birthDate.toISOString().slice(0, 10) : null,
    gender: rec.gender,
    emailVerified: Boolean(rec.emailVerifiedAt),
    phoneVerified: Boolean(rec.phoneVerifiedAt),
    status: rec.status,
  };
}

function toAddress(rec: CustomerAddressRecord) {
  return {
    id: rec.id,
    addressName: rec.addressName,
    fullName: rec.fullName,
    phone: rec.phone,
    city: rec.city,
    district: rec.district,
    addressLine1: rec.addressLine1,
    addressLine2: rec.addressLine2,
    postalCode: rec.postalCode,
    isDefaultShipping: rec.isDefaultShipping,
    isDefaultBilling: rec.isDefaultBilling,
    billingType: rec.billingType,
    // PII minimizasyonu: TCKN/VKN response'ta yalniz son 2 hane maskeli doner.
    tcknMasked: rec.tckn ? maskTaxId(rec.tckn) : null,
    companyName: rec.companyName,
    taxOffice: rec.taxOffice,
    taxNumberMasked: rec.taxNumber ? maskTaxId(rec.taxNumber) : null,
  };
}

function toIban(rec: CustomerIbanRecord) {
  return {
    id: rec.id,
    accountHolderName: rec.accountHolderName,
    ibanMasked: maskIban(rec.iban),
    isDefault: rec.isDefault,
  };
}

/* ── Sipariş serializasyonu (TODO-079) ────────────────────────────────────────
 * Müşteri-facing allowlist. Sipariş kartı/arama satırı yalnız güncel `variantId`
 * (tekrar satın al) + ürün bağlantısı/SKU taşır; eski sipariş fiyatı sepete
 * eklenmez (güncel katalogdan doğrulanır). */
function serializeCustomerOrderSummary(
  order: CustomerOrderRecord,
  // Dilim 6b — productId → güncel kapak URL'i (batched, tek çağrı). Kapaksız/
  // görselsiz ürün haritada yoktur → imageUrl null (ProductMedia placeholder).
  coverUrlByProductId: Map<string, string>,
) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    currency: order.currency,
    totalMinor: order.totalAmount,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: order.lines.map((line) => ({
      variantId: line.variantId,
      productSlug: line.productSlug,
      sku: line.sku,
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      // ALLOWLIST: yalnız türetilmiş güncel kapak URL'i; productId iç record'da
      // kalır, DTO'ya girmez. Kapaksız ürün → null.
      imageUrl: coverUrlByProductId.get(line.productId) ?? null,
    })),
    createdAt: order.createdAt.toISOString(),
    // TODO-135 — Hazırlanan gönderiyi liste rozetinde yansıtmak için temsili durum.
    shipmentStatus: order.shipmentStatus,
  };
}

/**
 * Sipariş detayı allowlist: tutar kırılımı + satırlar + teslimat adresi + fatura
 * özeti (taxId MASKELİ) + ödeme GÜVENLİ alanları. transactionId = sağlayıcı
 * işlem referansı (providerReference). PAN/CVC/token/hash ASLA dönmez.
 */
function serializeCustomerOrderDetail(
  order: CustomerOrderDetailRecord,
  // Dilim 6b — productId → güncel kapak URL'i (bu siparişin satırları için batched).
  coverUrlByProductId: Map<string, string>,
) {
  const shipping = order.addresses.find((address) => address.type === "SHIPPING") ?? null;
  let billing: {
    type: BillingType;
    name: string | null;
    companyName: string | null;
    taxOffice: string | null;
    taxId: string | null;
  } | null = null;
  if (order.billingType) {
    const rawTaxId =
      order.billingType === "INDIVIDUAL" ? order.billingTaxId : order.billingTaxNumber;
    billing = {
      type: order.billingType,
      name: order.billingName,
      companyName: order.billingCompanyName,
      taxOffice: order.billingTaxOffice,
      taxId: rawTaxId ? maskTaxId(rawTaxId) : null,
    };
  }
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    subtotalMinor: order.subtotalAmount,
    discountMinor: order.discountAmount,
    shippingMinor: order.shippingAmount,
    taxMinor: order.taxAmount,
    totalMinor: order.totalAmount,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: order.lines.map((line) => ({
      variantId: line.variantId,
      productSlug: line.productSlug,
      sku: line.sku,
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceAmount,
      lineTotalMinor: line.totalAmount,
      // ALLOWLIST: yalnız türetilmiş güncel kapak URL'i; productId DTO'ya girmez.
      imageUrl: coverUrlByProductId.get(line.productId) ?? null,
    })),
    shippingAddress: shipping
      ? {
          fullName: shipping.fullName,
          phone: shipping.phone,
          countryCode: shipping.countryCode,
          city: shipping.city,
          district: shipping.district,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2,
          postalCode: shipping.postalCode,
        }
      : null,
    billing,
    payment: order.payment
      ? {
          provider: order.payment.provider,
          method: order.payment.method,
          cardBrand: order.payment.cardBrand,
          cardLast4: order.payment.cardLast4,
          installmentCount: order.payment.installmentCount,
          transactionId: order.payment.providerReference,
          threeDsApplied: order.payment.threeDsApplied,
          paidAt: order.payment.paidAt ? order.payment.paidAt.toISOString() : null,
        }
      : null,
    shipment: order.shipment
      ? {
          providerName: order.shipment.providerName,
          logoUrl: order.shipment.logoUrl,
          logoAlt: order.shipment.logoAlt,
          status: order.shipment.status,
          trackingNumber: order.shipment.trackingNumber,
          trackingUrl: order.shipment.trackingUrl,
          lastLocation: order.shipment.lastLocation,
          updatedAt: order.shipment.updatedAt.toISOString(),
          events: order.shipment.events.map((event) => ({
            eventType: event.eventType,
            statusText: event.statusText,
            location: event.location,
            occurredAt: event.occurredAt ? event.occurredAt.toISOString() : null,
          })),
        }
      : null,
    // TODO-125 — Sipariş anında seçilen kargo sağlayıcı/seçenek özeti (snapshot).
    // shipment (canlı takip) ile karışmaz: bu, müşterinin checkout'ta yaptığı seçim.
    shippingSelection:
      (order.shippingRatePlanName ?? null) !== null ||
      (order.shippingProviderName ?? null) !== null ||
      (order.shippingProvider ?? null) !== null
        ? {
            providerType: order.shippingProvider ?? null,
            providerName: order.shippingProviderName ?? order.shippingRatePlanName ?? null,
            serviceName: order.shippingRatePlanName ?? null,
            amountMinor: order.shippingAmount,
            currency: order.shippingCurrency ?? order.currency,
            freeShipping: order.shippingAmount === 0,
            estimatedDelivery: order.shippingEtaText ?? null,
            logoUrl: order.shippingLogoUrl ?? null,
            logoAlt: null,
          }
        : null,
  };
}

/**
 * TODO-117 — Müşteri timeline'ında gösterilecek shipment event'leri. Operasyonel-iç
 * adımlar (barkod üretimi/webhook/iç oluşturma) müşteriye gösterilmez; ancak bir
 * konum (işlem noktası) taşıyan her event anlamlıdır ve dahil edilir. ADR-045.
 */
const CUSTOMER_VISIBLE_SHIPMENT_EVENTS = new Set([
  "ORDER_CREATED",
  "STATUS_CHANGED",
  "TRACKING_UPDATED",
  "MANUAL_TRACKING",
  "CANCELLED",
]);

export function isCustomerVisibleShipmentEvent(eventType: string, location: string | null): boolean {
  return CUSTOMER_VISIBLE_SHIPMENT_EVENTS.has(eventType) || location !== null;
}

/**
 * TODO-127 — Müşteri timeline'ında ORDER_CREATED ("Gönderi oluşturuldu") satırı, admin
 * için yazılan operasyonel statusText'i (ör. "... (DHL gönderi kaydı)") SIZDIRMAMALI.
 * Bu event için statusText null döndürülür → storefront i18n `eventValues.ORDER_CREATED`
 * ("Gönderi oluşturuldu") kullanılır. Sağlayıcı durumu taşıyan STATUS_CHANGED/
 * TRACKING_UPDATED gibi event'lerin statusText'i KORUNUR (gerçek takip bilgisi).
 */
export function customerSafeShipmentEventStatusText(
  eventType: string,
  statusText: string | null,
): string | null {
  return eventType === "ORDER_CREATED" ? null : statusText;
}

/**
 * F3C.6 — Ardisik ayni-icerikli event'leri musteri timeline'inda TEKLESTIRIR. Her sync
 * bir STATUS_CHANGED kaydi urettiginden (operasyonel senkron izi), saglayici durumu
 * degismeden yapilan tekrarli sync'ler musteriye ayni satiri N kez gostermemeli.
 * Yalnizca ARDISIK duplikasyon atilir: durumun A→B→A gecisi mesru bir zaman cizgisidir.
 */
export function dedupeConsecutiveShipmentEvents<
  T extends { eventType: string; statusText: string | null; location: string | null },
>(events: T[]): T[] {
  const out: T[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.eventType === event.eventType &&
      prev.statusText === event.statusText &&
      prev.location === event.location
    ) {
      continue;
    }
    out.push(event);
  }
  return out;
}

/* ── Yardimcilar ──────────────────────────────────────────────────────────── */

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function hashSessionToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

function hashOtpCode(code: string, secret: string): string {
  return createHash("sha256").update(`otp.${code}.${secret}`).digest("hex");
}

/** Admin credential token hash'i (TODO-087). Raw token DB'de tutulmaz; session
 *  deseniyle aynı: sha256(prefix.token.secret). */
function hashCredentialToken(token: string, secret: string): string {
  return createHash("sha256").update(`cred.${token}.${secret}`).digest("hex");
}

function maskDestination(channel: CustomerOtpChannel, value: string): string {
  if (channel === "EMAIL") {
    const [local, domain] = value.split("@");
    if (!domain) return "***";
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
  }
  return `*** *** ${value.slice(-2)}`;
}

/** Bireysel/kurumsal fatura kimligini guncellemede maskeli/bos gelirse korur. */
function resolveTaxFields(
  input: { billingType: BillingType | null; tckn?: string | null; taxNumber?: string | null },
  existing: { tckn: string | null; taxNumber: string | null } | null,
) {
  if (input.billingType === "INDIVIDUAL") {
    const provided = input.tckn && /^[0-9]{11}$/.test(digitsOnly(input.tckn)) ? digitsOnly(input.tckn) : null;
    return {
      tckn: provided ?? existing?.tckn ?? null,
      companyName: null,
      taxOffice: null,
      taxNumber: null,
    };
  }
  if (input.billingType === "CORPORATE") {
    const provided =
      input.taxNumber && /^[0-9]{10}$/.test(digitsOnly(input.taxNumber)) ? digitsOnly(input.taxNumber) : null;
    return { tckn: null, taxNumber: provided ?? existing?.taxNumber ?? null };
  }
  return { tckn: null, companyName: null, taxOffice: null, taxNumber: null };
}

/** Adres form girdisini DB kaydına normalize eder (storefront + admin ortak). */
function normalizeAddressInput(
  body: ReturnType<typeof customerAddressInputSchema.parse>,
  existing: { tckn: string | null; taxNumber: string | null } | null,
): CustomerAddressInputRecord {
  const billingType = body.billingType ?? null;
  const tax = resolveTaxFields(
    { billingType, tckn: body.tckn ?? null, taxNumber: body.taxNumber ?? null },
    existing,
  );
  return {
    addressName: body.addressName,
    fullName: body.fullName,
    phone: normalizeTrPhone(body.phone),
    city: body.city,
    district: body.district ?? null,
    addressLine1: body.addressLine1,
    addressLine2: body.addressLine2 ?? null,
    postalCode: body.postalCode ?? null,
    isDefaultShipping: body.isDefaultShipping,
    billingType,
    tckn: tax.tckn ?? null,
    companyName: billingType === "CORPORATE" ? (body.companyName ?? null) : null,
    taxOffice: billingType === "CORPORATE" ? (body.taxOffice ?? null) : null,
    taxNumber: tax.taxNumber ?? null,
  };
}

interface SimpleRateLimiter {
  isLimited(key: string): boolean;
  record(key: string): void;
  reset(key: string): void;
}

function createWindowRateLimiter(windowSeconds: number, maxAttempts: number): SimpleRateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    isLimited(key) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= Date.now()) return false;
      return entry.count >= maxAttempts;
    },
    record(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      } else {
        entry.count += 1;
      }
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

interface CustomerLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface CustomerRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: CustomerLogger;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  // Dilim 6b — sipariş satırı thumbnail'i için güncel kapak görseli çözümü (DI;
  // server.ts dataAccess.listProductImages'i geçirir). N+1'siz batched çağrı.
  listProductImages: ListProductImagesFn;
}

/**
 * Oturum cozumleyici: storefront `x-customer-session` header'i (raw token) ->
 * sha256 tokenHash -> CustomerSession. Store scope + suresi + ACTIVE durum dogrulanir.
 * Bu fonksiyon checkout order baglamada da kullanilmak uzere disa aktarilir.
 */
export async function resolveCustomerFromRequest(
  request: FastifyRequest,
  storeId: string,
  deps: { customers: CustomerDataAccess; config: AppConfig },
): Promise<CustomerAuthRecord | null> {
  const header = request.headers["x-customer-session"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) return null;
  const session = await deps.customers.findSessionByTokenHash(
    hashSessionToken(token, deps.config.SESSION_SECRET),
  );
  if (!session) return null;
  if (session.storeId !== storeId) return null;
  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (session.customer.status !== "ACTIVE") return null;
  return session.customer;
}

export function registerCustomerRoutes(app: FastifyInstance, deps: CustomerRoutesDeps): void {
  const { config, customers, logger, resolvePublicStore, listProductImages } = deps;
  const loginLimiter = createWindowRateLimiter(
    config.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    config.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  );
  const otpStartLimiter = createWindowRateLimiter(config.CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS, 1);

  async function requireStore(request: FastifyRequest, reply: FastifyReply) {
    const slug = (request.params as { storeSlug: string }).storeSlug;
    const store = await resolvePublicStore(slug);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }

  async function requireCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ): Promise<CustomerAuthRecord | null> {
    const customer = await resolveCustomerFromRequest(request, storeId, { customers, config });
    if (!customer) {
      await reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      return null;
    }
    return customer;
  }

  function issueOtpCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  function otpCodeMatches(record: CustomerOtpRecord, code: string): boolean {
    if (
      config.CUSTOMER_OTP_DEV_CODE &&
      config.APP_ENV !== "production" &&
      code === config.CUSTOMER_OTP_DEV_CODE
    ) {
      return true;
    }
    return record.codeHash === hashOtpCode(code, config.SESSION_SECRET);
  }

  // --- Kayit adim 1: identifier -> OTP --------------------------------------
  app.post("/public/stores/:storeSlug/customer/register/start", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = customerRegisterStartRequestSchema.parse(request.body);
    const identity = classifyIdentifier(body.identifier);
    if (identity.type === "invalid") {
      return reply
        .code(400)
        .send(errorBody("INVALID_IDENTIFIER", "Gecerli bir e-posta veya cep telefonu girin."));
    }
    const channel: CustomerOtpChannel = identity.type === "email" ? "EMAIL" : "SMS";
    const cooldownKey = `${store.id}:${identity.value}`;
    if (otpStartLimiter.isLimited(cooldownKey)) {
      return reply
        .code(429)
        .send(errorBody("OTP_COOLDOWN", "Yeni kod icin lutfen biraz bekleyin."));
    }

    let customer =
      identity.type === "email"
        ? await customers.findByEmail(store.id, identity.value)
        : await customers.findByPhone(store.id, identity.value);
    if (!customer) {
      customer = await customers.createPending(store.id, {
        email: identity.type === "email" ? identity.value : null,
        phone: identity.type === "phone" ? identity.value : null,
      });
    }

    const code = issueOtpCode();
    const expiresAt = new Date(Date.now() + config.CUSTOMER_OTP_TTL_SECONDS * 1000);
    await customers.createOtp({
      storeId: store.id,
      customerId: customer.id,
      purpose: "REGISTER",
      channel,
      destination: identity.value,
      codeHash: hashOtpCode(code, config.SESSION_SECRET),
      expiresAt,
    });
    otpStartLimiter.record(cooldownKey);
    // Mock/dev teslimat: gercek SMS/e-posta saglayici yok. Plain kod ASLA loglanmaz.
    logger.info("customer otp dispatched", {
      channel,
      purpose: "REGISTER",
      maskedDestination: maskDestination(channel, identity.value),
    });

    return customerOtpChallengeResponseSchema.parse({
      otpRequired: true,
      channel,
      maskedDestination: maskDestination(channel, identity.value),
      expiresInSeconds: config.CUSTOMER_OTP_TTL_SECONDS,
      resendAvailableInSeconds: config.CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS,
    });
  });

  // --- OTP dogrula (kod tuketilmez; UI ileri adima gecer) -------------------
  async function verifyOtpOrReply(
    reply: FastifyReply,
    storeId: string,
    identifierValue: { type: "email" | "phone"; value: string },
    code: string,
  ): Promise<{ customer: CustomerAuthRecord; otp: CustomerOtpRecord } | null> {
    const customer =
      identifierValue.type === "email"
        ? await customers.findByEmail(storeId, identifierValue.value)
        : await customers.findByPhone(storeId, identifierValue.value);
    if (!customer) {
      await reply.code(400).send(errorBody("INVALID_OTP", "Kod dogrulanamadi."));
      return null;
    }
    const otp = await customers.latestOtp(storeId, customer.id, "REGISTER");
    if (!otp) {
      await reply.code(400).send(errorBody("INVALID_OTP", "Kod dogrulanamadi."));
      return null;
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      await reply.code(400).send(errorBody("OTP_EXPIRED", "Kodun suresi doldu. Yeni kod isteyin."));
      return null;
    }
    if (otp.attemptCount >= config.CUSTOMER_OTP_MAX_ATTEMPTS) {
      await reply.code(429).send(errorBody("OTP_TOO_MANY_ATTEMPTS", "Cok fazla deneme. Yeni kod isteyin."));
      return null;
    }
    if (!otpCodeMatches(otp, code)) {
      await customers.bumpOtpAttempt(otp.id);
      await reply.code(400).send(errorBody("INVALID_OTP", "Kod dogrulanamadi."));
      return null;
    }
    return { customer, otp };
  }

  app.post("/public/stores/:storeSlug/customer/register/verify", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = customerOtpVerifyRequestSchema.parse(request.body);
    const identity = classifyIdentifier(body.identifier);
    if (identity.type === "invalid") {
      return reply.code(400).send(errorBody("INVALID_OTP", "Kod dogrulanamadi."));
    }
    const ok = await verifyOtpOrReply(reply, store.id, identity, body.code);
    if (!ok) return;
    return { verified: true };
  });

  // --- Kayit adim 3: profil + sifre + onaylar -> hesap + oturum -------------
  app.post("/public/stores/:storeSlug/customer/register/complete", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = customerRegisterCompleteRequestSchema.parse(request.body);
    const identity = classifyIdentifier(body.identifier);
    if (identity.type === "invalid") {
      return reply.code(400).send(errorBody("INVALID_OTP", "Kod dogrulanamadi."));
    }
    const ok = await verifyOtpOrReply(reply, store.id, identity, body.code);
    if (!ok) return;
    if (await customers.hasCredential(ok.customer.id)) {
      return reply
        .code(409)
        .send(errorBody("ACCOUNT_ALREADY_REGISTERED", "Bu hesap zaten kayitli. Giris yapin."));
    }
    const channel: CustomerOtpChannel = identity.type === "email" ? "EMAIL" : "SMS";
    const passwordHash = await hashPassword(body.password, config.PASSWORD_HASH_PEPPER);
    await customers.setCredential(store.id, ok.customer.id, passwordHash);
    const account = await customers.activateAndVerifyContact(store.id, ok.customer.id, channel, {
      firstName: body.firstName,
      lastName: body.lastName,
    });
    await customers.upsertCommPref(store.id, ok.customer.id, {
      smsEnabled: false,
      emailEnabled: true,
      phoneEnabled: false,
    });
    await customers.consumeOtp(ok.otp.id);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.CUSTOMER_SESSION_TTL_SECONDS * 1000);
    await customers.createSession({
      storeId: store.id,
      customerId: account.id,
      tokenHash: hashSessionToken(token, config.SESSION_SECRET),
      expiresAt,
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: request.ip,
    });
    return reply.code(201).send(
      customerSessionResponseSchema.parse({
        token,
        expiresAt: expiresAt.toISOString(),
        customer: toAccount(account),
      }),
    );
  });

  // --- Giris ----------------------------------------------------------------
  app.post("/public/stores/:storeSlug/customer/login", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = customerLoginRequestSchema.parse(request.body);
    const rateKey = `${store.id}:${request.ip}:${body.identifier}`;
    if (loginLimiter.isLimited(rateKey)) {
      return reply.code(429).send(errorBody("AUTH_RATE_LIMITED", "Cok fazla deneme. Daha sonra tekrar deneyin."));
    }
    const identity = classifyIdentifier(body.identifier);
    // Kullanici enumeration yaratma: tum basarisiz yollar ayni jenerik 401.
    const genericFail = () => {
      loginLimiter.record(rateKey);
      return reply.code(401).send(errorBody("INVALID_CREDENTIALS", "Bilgilerinizi kontrol edin."));
    };
    if (identity.type === "invalid") return genericFail();
    const customer =
      identity.type === "email"
        ? await customers.findByEmail(store.id, identity.value)
        : await customers.findByPhone(store.id, identity.value);
    if (!customer || customer.status !== "ACTIVE") return genericFail();
    const credentialHash = await customers.findCredentialHash(customer.id);
    if (!credentialHash) return genericFail();
    const passwordOk = await verifyPassword(body.password, credentialHash, config.PASSWORD_HASH_PEPPER);
    if (!passwordOk) return genericFail();
    loginLimiter.reset(rateKey);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.CUSTOMER_SESSION_TTL_SECONDS * 1000);
    await customers.createSession({
      storeId: store.id,
      customerId: customer.id,
      tokenHash: hashSessionToken(token, config.SESSION_SECRET),
      expiresAt,
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: request.ip,
    });
    return customerSessionResponseSchema.parse({
      token,
      expiresAt: expiresAt.toISOString(),
      customer: toAccount(customer),
    });
  });

  // --- Aktivasyon / parola belirleme (admin token'i ile, TODO-087) ----------
  // Admin tetikli ADMIN_ACTIVATION/ADMIN_PASSWORD_RESET token'ini tuketir; parolayi
  // set eder. Token tek seferlik (consumedAt). ADMIN_ACTIVATION ayrica musteriyi
  // ACTIVE yapar. Parola degisince mevcut tum oturumlar revoke edilir. Hatalar
  // jenerik; token'in durumu (expired/consumed/invalid) sizdirilmaz.
  app.post("/public/stores/:storeSlug/customer/activate", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const body = customerActivateRequestSchema.parse(request.body);
    const invalid = () =>
      reply.code(400).send(errorBody("INVALID_TOKEN", "Baglanti gecersiz veya suresi dolmus."));
    const token = await customers.findCredentialTokenByHash(
      hashCredentialToken(body.token, config.SESSION_SECRET),
    );
    if (!token) return invalid();
    if (token.storeId !== store.id) return invalid();
    if (token.consumedAt) return invalid();
    if (token.expiresAt.getTime() <= Date.now()) return invalid();

    // Once atomik tuket (cifte kullanim yarisini onler); ardindan parolayi set et.
    const consumed = await customers.consumeCredentialToken(token.id);
    if (!consumed) return invalid();

    const passwordHash = await hashPassword(body.password, config.PASSWORD_HASH_PEPPER);
    await customers.setCredential(store.id, token.customerId, passwordHash);
    if (token.purpose === "ADMIN_ACTIVATION") {
      await customers.setCustomerActive(store.id, token.customerId);
    }
    await customers.revokeAllSessions(store.id, token.customerId);
    // Plain token/parola ASLA loglanmaz; yalniz amac.
    logger.info("customer credential token consumed", { purpose: token.purpose });
    return customerActivateResponseSchema.parse({ activated: true });
  });

  // --- Cikis ----------------------------------------------------------------
  app.post("/public/stores/:storeSlug/customer/logout", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const header = request.headers["x-customer-session"];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      return customerLogoutResponseSchema.parse({ revoked: false });
    }
    const session = await customers.findSessionByTokenHash(
      hashSessionToken(token, config.SESSION_SECRET),
    );
    const revoked = session && session.storeId === store.id ? await customers.revokeSession(session.id) : false;
    return customerLogoutResponseSchema.parse({ revoked });
  });

  // --- Me -------------------------------------------------------------------
  app.get("/public/stores/:storeSlug/customer/me", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const header = request.headers["x-customer-session"];
    const token = Array.isArray(header) ? header[0] : header;
    const session = token
      ? await customers.findSessionByTokenHash(hashSessionToken(token, config.SESSION_SECRET))
      : null;
    return customerMeResponseSchema.parse({
      customer: toAccount(customer),
      session: { expiresAt: (session?.expiresAt ?? new Date()).toISOString() },
    });
  });

  // --- Profil ---------------------------------------------------------------
  app.put("/public/stores/:storeSlug/customer/profile", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerProfileUpdateRequestSchema.parse(request.body);
    const account = await customers.updateProfile(store.id, customer.id, {
      firstName: body.firstName,
      lastName: body.lastName,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      gender: body.gender ?? null,
    });
    return { customer: toAccount(account) };
  });

  // --- Sifre degisikligi (oturum korunur; passwordChangedAt guncellenir) ----
  app.put("/public/stores/:storeSlug/customer/password", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerPasswordChangeRequestSchema.parse(request.body);
    const currentHash = await customers.findCredentialHash(customer.id);
    const ok = currentHash
      ? await verifyPassword(body.currentPassword, currentHash, config.PASSWORD_HASH_PEPPER)
      : false;
    if (!ok) {
      return reply.code(400).send(errorBody("INVALID_CURRENT_PASSWORD", "Mevcut sifre hatali."));
    }
    const newHash = await hashPassword(body.newPassword, config.PASSWORD_HASH_PEPPER);
    await customers.updateCredential(customer.id, newHash);
    return { updated: true };
  });

  // --- Iletisim tercihleri --------------------------------------------------
  app.get("/public/stores/:storeSlug/customer/communication-preferences", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const pref = await customers.getCommPref(store.id, customer.id);
    return customerCommunicationPreferenceSchema.parse(pref);
  });

  app.put("/public/stores/:storeSlug/customer/communication-preferences", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerCommunicationPreferenceSchema.parse(request.body);
    await customers.upsertCommPref(store.id, customer.id, body);
    return customerCommunicationPreferenceSchema.parse(body);
  });

  // --- Adres defteri --------------------------------------------------------
  app.get("/public/stores/:storeSlug/customer/addresses", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const addresses = await customers.listAddresses(store.id, customer.id);
    return customerAddressListResponseSchema.parse({ data: addresses.map(toAddress) });
  });

  app.post("/public/stores/:storeSlug/customer/addresses", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerAddressInputSchema.parse(request.body);
    // Yeni kayitta bireysel TCKN zorunlu (varsa) — kurumsal VKN zorunlu.
    if (body.billingType === "INDIVIDUAL" && (!body.tckn || !isValidTckn(body.tckn))) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Gecerli T.C. Kimlik No zorunlu."));
    }
    if (body.billingType === "CORPORATE" && (!body.taxNumber || !isValidTaxNumber(body.taxNumber))) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Gecerli vergi no zorunlu."));
    }
    const created = await customers.createAddress(
      store.id,
      customer.id,
      normalizeAddressInput(body, null),
    );
    return reply.code(201).send({ address: toAddress(created) });
  });

  app.put("/public/stores/:storeSlug/customer/addresses/:addressId", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { addressId } = request.params as { addressId: string };
    const existing = await customers.findAddress(store.id, customer.id, addressId);
    if (!existing) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadi."));
    }
    const body = customerAddressInputSchema.parse(request.body);
    const updated = await customers.updateAddress(
      store.id,
      customer.id,
      addressId,
      normalizeAddressInput(body, { tckn: existing.tckn, taxNumber: existing.taxNumber }),
    );
    if (!updated) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadi."));
    }
    return { address: toAddress(updated) };
  });

  app.delete("/public/stores/:storeSlug/customer/addresses/:addressId", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { addressId } = request.params as { addressId: string };
    const deleted = await customers.softDeleteAddress(store.id, customer.id, addressId);
    if (!deleted) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadi."));
    }
    return { deleted: true };
  });

  app.post("/public/stores/:storeSlug/customer/addresses/:addressId/default", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { addressId } = request.params as { addressId: string };
    const ok = await customers.setDefaultAddress(store.id, customer.id, addressId);
    if (!ok) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadi."));
    }
    return { updated: true };
  });

  // --- IBAN -----------------------------------------------------------------
  app.get("/public/stores/:storeSlug/customer/ibans", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const ibans = await customers.listIbans(store.id, customer.id);
    return customerIbanListResponseSchema.parse({ data: ibans.map(toIban) });
  });

  app.post("/public/stores/:storeSlug/customer/ibans", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerIbanInputSchema.parse(request.body);
    const created = await customers.createIban(store.id, customer.id, {
      accountHolderName: body.accountHolderName,
      iban: normalizeIban(body.iban),
      isDefault: body.isDefault ?? false,
    });
    return reply.code(201).send({ iban: toIban(created) });
  });

  app.delete("/public/stores/:storeSlug/customer/ibans/:ibanId", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { ibanId } = request.params as { ibanId: string };
    const deleted = await customers.softDeleteIban(store.id, customer.id, ibanId);
    if (!deleted) {
      return reply.code(404).send(errorBody("IBAN_NOT_FOUND", "IBAN bulunamadi."));
    }
    return { deleted: true };
  });

  app.post("/public/stores/:storeSlug/customer/ibans/:ibanId/default", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { ibanId } = request.params as { ibanId: string };
    const ok = await customers.setDefaultIban(store.id, customer.id, ibanId);
    if (!ok) {
      return reply.code(404).send(errorBody("IBAN_NOT_FOUND", "IBAN bulunamadi."));
    }
    return { updated: true };
  });

  // --- Siparislerim (yalniz kendi siparisleri) ------------------------------
  app.get("/public/stores/:storeSlug/customer/orders", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const orders = await customers.listOrders(store.id, customer.id);
    // Dilim 6b — TÜM siparişlerin TÜM satırlarının productId'lerini topla → TEK
    // batched listProductImages çağrısı (N+1 YOK; helper unique'ler + boşsa erken döner).
    const coverUrlByProductId = await buildProductCoverUrlMap(
      listProductImages,
      config.MEDIA_PUBLIC_BASE_URL,
      store.id,
      orders.flatMap((order) => order.lines.map((line) => line.productId)),
    );
    return customerOrderListResponseSchema.parse({
      data: orders.map((order) => serializeCustomerOrderSummary(order, coverUrlByProductId)),
    });
  });

  // Sipariş detayı — YALNIZ kendi siparişi; başka müşteri/yok → 404.
  app.get("/public/stores/:storeSlug/customer/orders/:orderNumber", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { orderNumber } = request.params as { orderNumber: string };
    const order = await customers.getOrderDetail(store.id, customer.id, orderNumber);
    if (!order) {
      return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));
    }
    // Dilim 6b — tek siparişin satırları için TEK batched kapak çağrısı (N+1 YOK).
    const coverUrlByProductId = await buildProductCoverUrlMap(
      listProductImages,
      config.MEDIA_PUBLIC_BASE_URL,
      store.id,
      order.lines.map((line) => line.productId),
    );
    return customerOrderDetailResponseSchema.parse({
      order: serializeCustomerOrderDetail(order, coverUrlByProductId),
    });
  });
}

/* ── Store-admin müşteri yönetimi (F3B.3) ─────────────────────────────────────
 * Mağaza paneli müşteri DETAY + yönetim uçları. `requireStoreAdmin` guard'ı
 * server.ts'ten (platform-admin + store scope) enjekte edilir. Tüm sorgular
 * store+customer scoped; başka mağaza müşterisi görülemez/değiştirilemez.
 * credential/session/OTP hash response'a ÇIKMAZ; TCKN/VKN/IBAN MASKELİ döner. */

export interface CustomerAdminRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: CustomerLogger;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
}

interface AdminParams {
  storeId: string;
  customerId: string;
}

export function registerCustomerAdminRoutes(app: FastifyInstance, deps: CustomerAdminRoutesDeps): void {
  const { config, customers, logger, requireStoreAdmin } = deps;

  function adminParams(request: FastifyRequest): AdminParams {
    const { storeId, customerId } = request.params as AdminParams;
    return { storeId, customerId };
  }

  // Tek seferlik kurulum jetonu uretir + hash'ini saklar. Raw token YALNIZ
  // donus degerinde gecer (response'ta tek seferlik); DB'de yalniz hash tutulur.
  async function issueCredentialToken(
    storeId: string,
    customerId: string,
    purpose: CustomerCredentialTokenPurpose,
    createdByUserId: string,
  ): Promise<{ token: string; purpose: CustomerCredentialTokenPurpose; expiresAt: string }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS * 1000);
    await customers.createCredentialToken({
      storeId,
      customerId,
      purpose,
      tokenHash: hashCredentialToken(token, config.SESSION_SECRET),
      expiresAt,
      createdByUserId,
    });
    // Plain token ASLA loglanmaz; yalniz amac + maskesiz olmayan musteri id.
    logger.info("customer credential token issued", { purpose, customerId });
    return { token, purpose, expiresAt: expiresAt.toISOString() };
  }

  // İptal edilenler harcamaya dahil edilmez (liste ucu ile aynı kural).
  function summarizeOrders(
    orders: Awaited<ReturnType<CustomerDataAccess["listOrders"]>>,
  ): { orderCount: number; totalSpentMinor: number; currency: string; lastOrderAt: Date | null } {
    const billable = orders.filter((order) => order.status !== "CANCELLED");
    const totalSpentMinor = billable.reduce((sum, order) => sum + order.totalAmount, 0);
    return {
      orderCount: orders.length,
      totalSpentMinor,
      currency: billable[0]?.currency ?? orders[0]?.currency ?? "TRY",
      lastOrderAt: orders[0]?.createdAt ?? null,
    };
  }

  // --- Detay ----------------------------------------------------------------
  app.get("/stores/:storeId/customers/:customerId", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const [addresses, ibans, commPref, orders, credentialMeta, activeSessionCount] =
      await Promise.all([
        customers.listAddresses(storeId, customerId),
        customers.listIbans(storeId, customerId),
        customers.getCommPref(storeId, customerId),
        customers.listOrders(storeId, customerId),
        customers.getCredentialMeta(customerId),
        customers.countActiveSessions(storeId, customerId),
      ]);
    const stats = summarizeOrders(orders);
    const fullName = [detail.firstName, detail.lastName].filter(Boolean).join(" ").trim();
    return storeAdminCustomerDetailResponseSchema.parse({
      customer: {
        id: detail.id,
        email: detail.email,
        phone: detail.phone,
        firstName: detail.firstName,
        lastName: detail.lastName,
        fullName: fullName.length > 0 ? fullName : (detail.email ?? detail.phone ?? detail.id),
        birthDate: detail.birthDate ? detail.birthDate.toISOString().slice(0, 10) : null,
        gender: detail.gender,
        status: detail.status,
        emailVerified: Boolean(detail.emailVerifiedAt),
        phoneVerified: Boolean(detail.phoneVerifiedAt),
        hasCredential: detail.hasCredential,
        orderCount: stats.orderCount,
        totalSpentMinor: stats.totalSpentMinor,
        currency: stats.currency,
        lastOrderAt: stats.lastOrderAt?.toISOString() ?? null,
        createdAt: detail.createdAt.toISOString(),
      },
      security: {
        hasCredential: detail.hasCredential,
        // passwordHash ASLA dönmez; yalnız son değişim zamanı (varsa).
        passwordChangedAt: credentialMeta?.passwordChangedAt.toISOString() ?? null,
        activeSessionCount,
      },
      addresses: addresses.map(toAddress),
      ibans: ibans.map(toIban),
      communicationPreference: commPref,
      // Store-admin müşteri detayı sipariş ÖZETİ thumbnail göstermez (vitrin
      // Hesabım dilimi kapsamı dışı) → boş kapak haritası, imageUrl null olur.
      orders: orders.map((order) => serializeCustomerOrderSummary(order, new Map())),
    });
  });

  // --- Temel bilgi / durum güncelleme ---------------------------------------
  app.patch("/stores/:storeId/customers/:customerId", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = storeAdminCustomerUpdateRequestSchema.parse(request.body);
    const result = await customers.adminUpdateCustomer(storeId, customerId, {
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ? normalizeTrPhone(body.phone) : body.phone } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.birthDate !== undefined ? { birthDate: body.birthDate ? new Date(body.birthDate) : null } : {}),
      ...(body.gender !== undefined ? { gender: body.gender } : {}),
    });
    if (result === "NOT_FOUND") {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    if (result === "EMAIL_TAKEN") {
      return reply.code(409).send(errorBody("EMAIL_TAKEN", "Bu e-posta bu mağazada kullanımda."));
    }
    if (result === "PHONE_TAKEN") {
      return reply.code(409).send(errorBody("PHONE_TAKEN", "Bu telefon bu mağazada kullanımda."));
    }
    return { customer: toAccount(result) };
  });

  // --- Müşteri oluştur (TODO-087) -------------------------------------------
  // Ad Soyad + e-posta/telefon (en az biri) + durum. createMembership=true ise
  // ADMIN_ACTIVATION token üretir ve tek seferlik kurulum jetonu döner.
  app.post("/stores/:storeId/customers", async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const body = storeAdminCustomerCreateRequestSchema.parse(request.body);
    const { firstName, lastName } = splitFullName(body.fullName);
    const email = body.email && body.email.trim().length > 0 ? body.email.trim().toLowerCase() : null;
    const phone = body.phone && body.phone.trim().length > 0 ? normalizeTrPhone(body.phone) : null;
    const created = await customers.adminCreateCustomer(storeId, {
      firstName,
      lastName,
      email,
      phone,
      status: body.status,
    });
    if (created === "EMAIL_TAKEN") {
      return reply.code(409).send(errorBody("EMAIL_TAKEN", "Bu e-posta bu mağazada kullanımda."));
    }
    if (created === "PHONE_TAKEN") {
      return reply.code(409).send(errorBody("PHONE_TAKEN", "Bu telefon bu mağazada kullanımda."));
    }

    const setup = body.createMembership
      ? await issueCredentialToken(storeId, created.id, "ADMIN_ACTIVATION", access.actorUserId)
      : null;

    const fullName = [created.firstName, created.lastName].filter(Boolean).join(" ").trim();
    return reply.code(201).send(
      storeAdminCustomerCreateResponseSchema.parse({
        customer: {
          id: created.id,
          email: created.email,
          phone: created.phone,
          firstName: created.firstName,
          lastName: created.lastName,
          fullName: fullName.length > 0 ? fullName : (created.email ?? created.phone ?? created.id),
          status: created.status,
          emailVerified: Boolean(created.emailVerifiedAt),
          phoneVerified: Boolean(created.phoneVerifiedAt),
          // Yeni kayıt: credential henüz yok (aktivasyon ile gelir), agregalar sıfır.
          hasCredential: false,
          orderCount: 0,
          totalSpentMinor: 0,
          currency: "TRY",
          lastOrderAt: null,
          addressCount: 0,
          defaultAddressSummary: null,
          createdAt: new Date().toISOString(),
        },
        setup,
      }),
    );
  });

  // --- Üyelik hesabı oluştur (credential yok → ADMIN_ACTIVATION) ------------
  app.post("/stores/:storeId/customers/:customerId/credential", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    if (detail.hasCredential) {
      return reply.code(409).send(errorBody("CREDENTIAL_EXISTS", "Bu müşterinin zaten üyelik hesabı var."));
    }
    // Aktivasyon linkini tüketebilmek için bir tanımlayıcı (e-posta/telefon) gerekir.
    if (!detail.email && !detail.phone) {
      return reply.code(400).send(errorBody("IDENTIFIER_REQUIRED", "Üyelik için e-posta veya telefon gerekli."));
    }
    const setup = await issueCredentialToken(storeId, customerId, "ADMIN_ACTIVATION", access.actorUserId);
    return reply.code(201).send(storeAdminCredentialTokenResponseSchema.parse({ setup }));
  });

  // --- Parola sıfırlama (credential var → ADMIN_PASSWORD_RESET) -------------
  app.post("/stores/:storeId/customers/:customerId/credential/reset", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    if (!detail.hasCredential) {
      return reply.code(409).send(errorBody("NO_CREDENTIAL", "Bu müşterinin üyelik hesabı yok."));
    }
    const setup = await issueCredentialToken(storeId, customerId, "ADMIN_PASSWORD_RESET", access.actorUserId);
    return reply.code(201).send(storeAdminCredentialTokenResponseSchema.parse({ setup }));
  });

  // --- Tüm oturumları sonlandır ---------------------------------------------
  app.post("/stores/:storeId/customers/:customerId/sessions/revoke", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const revokedCount = await customers.revokeAllSessions(storeId, customerId);
    logger.info("customer sessions revoked", { customerId, revokedCount });
    return storeAdminRevokeSessionsResponseSchema.parse({ revokedCount });
  });

  // --- İletişim tercihleri --------------------------------------------------
  app.put("/stores/:storeId/customers/:customerId/communication-preferences", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const body = customerCommunicationPreferenceSchema.parse(request.body);
    await customers.upsertCommPref(storeId, customerId, body);
    return customerCommunicationPreferenceSchema.parse(body);
  });

  // --- Adres defteri --------------------------------------------------------
  app.post("/stores/:storeId/customers/:customerId/addresses", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const body = customerAddressInputSchema.parse(request.body);
    if (body.billingType === "INDIVIDUAL" && (!body.tckn || !isValidTckn(body.tckn))) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Geçerli T.C. Kimlik No zorunlu."));
    }
    if (body.billingType === "CORPORATE" && (!body.taxNumber || !isValidTaxNumber(body.taxNumber))) {
      return reply.code(400).send(errorBody("VALIDATION_ERROR", "Geçerli vergi no zorunlu."));
    }
    const created = await customers.createAddress(storeId, customerId, normalizeAddressInput(body, null));
    return reply.code(201).send({ address: toAddress(created) });
  });

  app.patch("/stores/:storeId/customers/:customerId/addresses/:addressId", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const { addressId } = request.params as { addressId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const existing = await customers.findAddress(storeId, customerId, addressId);
    if (!existing) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadı."));
    }
    const body = customerAddressInputSchema.parse(request.body);
    const updated = await customers.updateAddress(
      storeId,
      customerId,
      addressId,
      normalizeAddressInput(body, { tckn: existing.tckn, taxNumber: existing.taxNumber }),
    );
    if (!updated) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadı."));
    }
    return { address: toAddress(updated) };
  });

  app.delete("/stores/:storeId/customers/:customerId/addresses/:addressId", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const { addressId } = request.params as { addressId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const deleted = await customers.softDeleteAddress(storeId, customerId, addressId);
    if (!deleted) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadı."));
    }
    return { deleted: true };
  });

  app.post("/stores/:storeId/customers/:customerId/addresses/:addressId/default", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const { addressId } = request.params as { addressId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const ok = await customers.setDefaultAddress(storeId, customerId, addressId);
    if (!ok) {
      return reply.code(404).send(errorBody("ADDRESS_NOT_FOUND", "Adres bulunamadı."));
    }
    return { updated: true };
  });

  // --- IBAN -----------------------------------------------------------------
  app.post("/stores/:storeId/customers/:customerId/ibans", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const detail = await customers.adminFindDetail(storeId, customerId);
    if (!detail) {
      return reply.code(404).send(errorBody("CUSTOMER_NOT_FOUND", "Müşteri bulunamadı."));
    }
    const body = customerIbanInputSchema.parse(request.body);
    const created = await customers.createIban(storeId, customerId, {
      accountHolderName: body.accountHolderName,
      iban: normalizeIban(body.iban),
      isDefault: body.isDefault ?? false,
    });
    return reply.code(201).send({ iban: toIban(created) });
  });

  app.delete("/stores/:storeId/customers/:customerId/ibans/:ibanId", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const { ibanId } = request.params as { ibanId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const deleted = await customers.softDeleteIban(storeId, customerId, ibanId);
    if (!deleted) {
      return reply.code(404).send(errorBody("IBAN_NOT_FOUND", "IBAN bulunamadı."));
    }
    return { deleted: true };
  });

  app.post("/stores/:storeId/customers/:customerId/ibans/:ibanId/default", async (request, reply) => {
    const { storeId, customerId } = adminParams(request);
    const { ibanId } = request.params as { ibanId: string };
    const access = await requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const ok = await customers.setDefaultIban(storeId, customerId, ibanId);
    if (!ok) {
      return reply.code(404).send(errorBody("IBAN_NOT_FOUND", "IBAN bulunamadı."));
    }
    return { updated: true };
  });
}
