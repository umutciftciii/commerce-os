/**
 * TODO-168 (ADR-267) — CartChangeEvent veri katmanı (best-effort analytics/audit).
 *
 * RecommendationEvent deseni: FK-minimal (yalnız Store), KVKK-hash kimlik (ham cart/müşteri YOK),
 * `(storeId, dedupeKey)` idempotent upsert. Read side-effect-FREE — satır yalnız açık ingest ucundan
 * yazılır; cart re-render 0 yeni satır üretir. Ölçüm hatası UX'i ETKİLEMEZ (çağıran yutar).
 */
import type { PrismaClient } from "@prisma/client";

export interface CartChangeEventInput {
  storeId: string;
  cartIdHash: string;
  customerIdHash?: string | null;
  productId?: string | null;
  variantId?: string | null;
  changeType: string;
  eventType: string;
  severity?: string | null;
  oldMinor?: number | null;
  newMinor?: number | null;
  currency?: string | null;
  fingerprint: string;
  placement?: string | null;
  dedupeKey: string;
  now: Date;
}

export interface CartChangeEventData {
  dedupeKeyExists(storeId: string, dedupeKey: string): Promise<boolean>;
  insertEvent(input: CartChangeEventInput): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export function createCartChangeEventData(db: PrismaClient): CartChangeEventData {
  return {
    async dedupeKeyExists(storeId, dedupeKey) {
      const row = await db.cartChangeEvent.findFirst({
        where: { storeId, dedupeKey },
        select: { id: true },
      });
      return row !== null;
    },

    async insertEvent(input) {
      try {
        await db.cartChangeEvent.create({
          data: {
            storeId: input.storeId,
            cartIdHash: input.cartIdHash,
            customerIdHash: input.customerIdHash ?? null,
            productId: input.productId ?? null,
            variantId: input.variantId ?? null,
            changeType: input.changeType,
            eventType: input.eventType,
            severity: input.severity ?? null,
            oldMinor: input.oldMinor ?? null,
            newMinor: input.newMinor ?? null,
            currency: input.currency ?? null,
            fingerprint: input.fingerprint,
            placement: input.placement ?? null,
            dedupeKey: input.dedupeKey,
            occurredAt: input.now,
          },
          select: { id: true },
        });
      } catch (error) {
        if (isUniqueViolation(error)) return; // (storeId, dedupeKey) idempotency — yarış guard
        throw error;
      }
    },
  };
}

/** dedupeKey = hash(eventType, fingerprint) → aynı (cart, değişiklik, eventType) en fazla bir kez. */
export function cartChangeEventDedupeKey(eventType: string, fingerprint: string): string {
  return `${eventType}:${fingerprint}`;
}
