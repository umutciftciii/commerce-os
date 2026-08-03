/**
 * TODO-168 (ADR-267) — CartChangeAck veri katmanı (cross-device acknowledgement).
 *
 * Per-fingerprint ack: `(cartId, fingerprint)` unique → idempotent (P2002 yutulur). Ack cart line'ları
 * MUTASYONA UĞRATMAZ (version bump yok) — yalnız satır ekler; guncel projeksiyonda o degisiklik
 * `acknowledged` doner ve checkout WARN gate'i acilir. Yeni fiyat degisikligi YENI fingerprint uretir →
 * eski ack yeni degisikligi gizlemez. Tum sorgular store-scoped (tenant fail-closed).
 */
import type { PrismaClient } from "@prisma/client";

export interface CartChangeAckInput {
  storeId: string;
  cartId: string;
  cartLineId?: string | null;
  customerId?: string | null;
  fingerprint: string;
  changeType: string;
}

export interface CartChangeAckData {
  /** Bu cart için onaylanmış fingerprint kümesi (store-scoped). */
  listAckFingerprints(storeId: string, cartId: string): Promise<string[]>;
  /** Tek fingerprint ack (idempotent). */
  insertAck(input: CartChangeAckInput): Promise<void>;
  /** Birden çok fingerprint ack (tümünü-gördüm; her biri idempotent). */
  insertAcks(inputs: CartChangeAckInput[]): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export function createCartChangeAckData(db: PrismaClient): CartChangeAckData {
  async function insertOne(input: CartChangeAckInput): Promise<void> {
    try {
      await db.cartChangeAck.create({
        data: {
          storeId: input.storeId,
          cartId: input.cartId,
          cartLineId: input.cartLineId ?? null,
          customerId: input.customerId ?? null,
          fingerprint: input.fingerprint,
          changeType: input.changeType,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return; // zaten ack'li → idempotent no-op
      throw error;
    }
  }

  return {
    async listAckFingerprints(storeId, cartId) {
      const rows = await db.cartChangeAck.findMany({
        where: { storeId, cartId },
        select: { fingerprint: true },
      });
      return rows.map((r) => r.fingerprint);
    },
    insertAck: insertOne,
    async insertAcks(inputs) {
      for (const input of inputs) await insertOne(input);
    },
  };
}
