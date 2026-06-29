/**
 * F3C.2 — Store-admin kargo TARIFE plani uclari (price engine).
 *
 * Guvenlik:
 *  - Tum uclar requireStoreAdmin (platform admin + store scope) ile korunur.
 *  - Store izolasyonu: tum sorgular {id, storeId} / {ratePlanId, storeId} ile
 *    scoped; baska store'un plan/kural verisi gorunmez (404).
 *  - Tarife planlari SECRET icermez (fiyat/kural verisi). Provider iliskilendirme
 *    yalniz UI/rapor icindir; canli quote YOK.
 *  - Tek default guard UYGULAMA katmanindadir (set-default transaction'inda
 *    diger ACTIVE planlarin isDefault=false yapilir).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@commerce-os/db";
import {
  shippingRatePlanCreateRequestSchema,
  shippingRatePlanListResponseSchema,
  shippingRatePlanSchema,
  shippingRatePlanUpdateRequestSchema,
  shippingRateRuleInputSchema,
  shippingRateRulePatchSchema,
  shippingRateTierInputSchema,
  shippingRateZoneInputSchema,
  shippingSurchargeInputSchema,
} from "@commerce-os/contracts";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { serializeRatePlan, type RatePlanWithRules } from "./rate-plan-service.js";

export interface ShippingRatePlanRoutesDeps {
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}

const storeParam = z.object({ storeId: z.string().min(1) });
const planParam = z.object({ storeId: z.string().min(1), id: z.string().min(1) });
const ruleParam = z.object({
  storeId: z.string().min(1),
  id: z.string().min(1),
  ruleId: z.string().min(1),
});
const childParam = z.object({
  storeId: z.string().min(1),
  id: z.string().min(1),
  childId: z.string().min(1),
});

const ratePlanInclude = {
  rules: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  tiers: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  zones: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  surcharges: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.ShippingRatePlanInclude;

/** Aylik gonderi araliklari (tier) cakisma kontrolu. null = acik uc. */
function rangesOverlap(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean {
  const lo1 = aMin ?? Number.NEGATIVE_INFINITY;
  const hi1 = aMax ?? Number.POSITIVE_INFINITY;
  const lo2 = bMin ?? Number.NEGATIVE_INFINITY;
  const hi2 = bMax ?? Number.POSITIVE_INFINITY;
  return lo1 <= hi2 && lo2 <= hi1;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

/** Tarife planinin tutarliligi: mode bazli zorunlu alanlar. */
function validatePlanShape(input: {
  pricingMode: string;
  fixedAmountMinor?: number | null;
  freeShippingThresholdMinor?: number | null;
}): string | null {
  if ((input.pricingMode === "FIXED" || input.pricingMode === "FREE_THRESHOLD") && input.fixedAmountMinor == null) {
    return "FIXED_AMOUNT_REQUIRED";
  }
  if (input.pricingMode === "FREE_THRESHOLD" && input.freeShippingThresholdMinor == null) {
    return "FREE_THRESHOLD_REQUIRED";
  }
  return null;
}

export function registerShippingRatePlanRoutes(
  app: FastifyInstance,
  deps: ShippingRatePlanRoutesDeps,
): void {
  async function loadPlan(storeId: string, id: string): Promise<RatePlanWithRules | null> {
    return prisma.shippingRatePlan.findFirst({ where: { id, storeId }, include: ratePlanInclude });
  }

  /* ───────────── Plan CRUD ───────────── */

  app.get("/stores/:storeId/shipping/rate-plans", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plans = await prisma.shippingRatePlan.findMany({
      where: { storeId: params.storeId },
      include: ratePlanInclude,
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return shippingRatePlanListResponseSchema.parse({ data: plans.map(serializeRatePlan) });
  });

  app.post("/stores/:storeId/shipping/rate-plans", async (request, reply) => {
    const params = storeParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRatePlanCreateRequestSchema.parse(request.body);
    const shapeError = validatePlanShape(input);
    if (shapeError) return reply.code(400).send(errorBody(shapeError, "Tarife alanlari eksik/gecersiz."));

    const created = await prisma.$transaction(async (tx) => {
      // isDefault=true ise diger ACTIVE planlarin default'u kapatilir (tek default).
      if (input.isDefault) {
        await tx.shippingRatePlan.updateMany({
          where: { storeId: params.storeId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.shippingRatePlan.create({
        data: {
          storeId: params.storeId,
          provider: input.provider ?? null,
          name: input.name,
          status: input.status,
          isDefault: input.isDefault,
          pricingMode: input.pricingMode,
          currency: input.currency,
          fixedAmountMinor: input.fixedAmountMinor ?? null,
          freeShippingThresholdMinor: input.freeShippingThresholdMinor ?? null,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          validTo: input.validTo ? new Date(input.validTo) : null,
        },
        include: ratePlanInclude,
      });
    });
    await deps.recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRatePlan",
      entityId: created.id,
      metadata: { pricingMode: created.pricingMode, isDefault: created.isDefault },
    });
    return reply.code(201).send(shippingRatePlanSchema.parse(serializeRatePlan(created)));
  });

  app.get("/stores/:storeId/shipping/rate-plans/:id", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    return shippingRatePlanSchema.parse(serializeRatePlan(plan));
  });

  app.patch("/stores/:storeId/shipping/rate-plans/:id", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRatePlanUpdateRequestSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));

    const nextMode = input.pricingMode ?? plan.pricingMode;
    const nextFixed = input.fixedAmountMinor !== undefined ? input.fixedAmountMinor : plan.fixedAmountMinor;
    const nextThreshold =
      input.freeShippingThresholdMinor !== undefined
        ? input.freeShippingThresholdMinor
        : plan.freeShippingThresholdMinor;
    const shapeError = validatePlanShape({
      pricingMode: nextMode,
      fixedAmountMinor: nextFixed,
      freeShippingThresholdMinor: nextThreshold,
    });
    if (shapeError) return reply.code(400).send(errorBody(shapeError, "Tarife alanlari eksik/gecersiz."));

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.shippingRatePlan.updateMany({
          where: { storeId: params.storeId, isDefault: true, id: { not: plan.id } },
          data: { isDefault: false },
        });
      }
      return tx.shippingRatePlan.update({
        where: { id: plan.id },
        data: {
          provider: input.provider !== undefined ? input.provider ?? null : undefined,
          name: input.name,
          status: input.status,
          isDefault: input.isDefault,
          pricingMode: input.pricingMode,
          currency: input.currency,
          fixedAmountMinor: input.fixedAmountMinor,
          freeShippingThresholdMinor: input.freeShippingThresholdMinor,
          validFrom:
            input.validFrom !== undefined ? (input.validFrom ? new Date(input.validFrom) : null) : undefined,
          validTo: input.validTo !== undefined ? (input.validTo ? new Date(input.validTo) : null) : undefined,
        },
        include: ratePlanInclude,
      });
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRatePlan",
      entityId: updated.id,
      metadata: { fields: Object.keys(input) },
    });
    return shippingRatePlanSchema.parse(serializeRatePlan(updated));
  });

  app.delete("/stores/:storeId/shipping/rate-plans/:id", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    await prisma.shippingRatePlan.delete({ where: { id: plan.id } });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRatePlan",
      entityId: plan.id,
      metadata: { name: plan.name },
    });
    return reply.code(200).send({ ok: true });
  });

  app.post("/stores/:storeId/shipping/rate-plans/:id/default", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    if (plan.status !== "ACTIVE") {
      return reply.code(409).send(errorBody("RATE_PLAN_NOT_ACTIVE", "Pasif tarife varsayılan yapılamaz."));
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.shippingRatePlan.updateMany({
        where: { storeId: params.storeId, isDefault: true, id: { not: plan.id } },
        data: { isDefault: false },
      });
      return tx.shippingRatePlan.update({
        where: { id: plan.id },
        data: { isDefault: true },
        include: ratePlanInclude,
      });
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRatePlan",
      entityId: updated.id,
      metadata: { setDefault: true },
    });
    return shippingRatePlanSchema.parse(serializeRatePlan(updated));
  });

  /* ───────────── Rule CRUD ───────────── */

  app.post("/stores/:storeId/shipping/rate-plans/:id/rules", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRateRuleInputSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    // tier/zone plan kapsami disindaysa reddet (store izolasyonu + tutarlilik).
    if (input.tierId && !plan.tiers.some((t) => t.id === input.tierId)) {
      return reply.code(400).send(errorBody("TIER_NOT_IN_PLAN", "Segment bu tarifeye ait değil."));
    }
    if (input.zoneId && !plan.zones.some((zoneRow) => zoneRow.id === input.zoneId)) {
      return reply.code(400).send(errorBody("ZONE_NOT_IN_PLAN", "Bölge bu tarifeye ait değil."));
    }
    await prisma.shippingRateRule.create({
      data: {
        ratePlanId: plan.id,
        storeId: params.storeId,
        tierId: input.tierId ?? null,
        zoneId: input.zoneId ?? null,
        minDesi: input.minDesi ?? null,
        maxDesi: input.maxDesi ?? null,
        minWeightKg: input.minWeightKg ?? null,
        maxWeightKg: input.maxWeightKg ?? null,
        cityCode: input.cityCode ?? null,
        districtCode: input.districtCode ?? null,
        regionCode: input.regionCode ?? null,
        chargeType: input.chargeType,
        amountMinor: input.amountMinor ?? null,
        unitAmountMinor: input.unitAmountMinor ?? null,
        baseAmountMinor: input.baseAmountMinor ?? null,
        baseThreshold: input.baseThreshold ?? null,
        extraAmountMinor: input.extraAmountMinor ?? null,
        sortOrder: input.sortOrder,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateRule",
      entityId: plan.id,
      metadata: { action: "addRule" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return reply.code(201).send(shippingRatePlanSchema.parse(serializeRatePlan(reloaded!)));
  });

  app.patch("/stores/:storeId/shipping/rate-plans/:id/rules/:ruleId", async (request, reply) => {
    const params = ruleParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRateRulePatchSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    const rule = plan.rules.find((r) => r.id === params.ruleId);
    if (!rule) return reply.code(404).send(errorBody("RATE_RULE_NOT_FOUND", "Kural bulunamadı."));
    if (input.tierId && !plan.tiers.some((t) => t.id === input.tierId)) {
      return reply.code(400).send(errorBody("TIER_NOT_IN_PLAN", "Segment bu tarifeye ait değil."));
    }
    if (input.zoneId && !plan.zones.some((zoneRow) => zoneRow.id === input.zoneId)) {
      return reply.code(400).send(errorBody("ZONE_NOT_IN_PLAN", "Bölge bu tarifeye ait değil."));
    }
    await prisma.shippingRateRule.update({
      where: { id: rule.id },
      data: {
        tierId: input.tierId !== undefined ? input.tierId : undefined,
        zoneId: input.zoneId !== undefined ? input.zoneId : undefined,
        minDesi: input.minDesi !== undefined ? input.minDesi : undefined,
        maxDesi: input.maxDesi !== undefined ? input.maxDesi : undefined,
        minWeightKg: input.minWeightKg !== undefined ? input.minWeightKg : undefined,
        maxWeightKg: input.maxWeightKg !== undefined ? input.maxWeightKg : undefined,
        cityCode: input.cityCode !== undefined ? input.cityCode : undefined,
        districtCode: input.districtCode !== undefined ? input.districtCode : undefined,
        regionCode: input.regionCode !== undefined ? input.regionCode : undefined,
        chargeType: input.chargeType !== undefined ? input.chargeType : undefined,
        amountMinor: input.amountMinor !== undefined ? input.amountMinor : undefined,
        unitAmountMinor: input.unitAmountMinor !== undefined ? input.unitAmountMinor : undefined,
        baseAmountMinor: input.baseAmountMinor !== undefined ? input.baseAmountMinor : undefined,
        baseThreshold: input.baseThreshold !== undefined ? input.baseThreshold : undefined,
        extraAmountMinor: input.extraAmountMinor !== undefined ? input.extraAmountMinor : undefined,
        sortOrder: input.sortOrder,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateRule",
      entityId: rule.id,
      metadata: { action: "updateRule" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return shippingRatePlanSchema.parse(serializeRatePlan(reloaded!));
  });

  app.delete("/stores/:storeId/shipping/rate-plans/:id/rules/:ruleId", async (request, reply) => {
    const params = ruleParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    const rule = plan.rules.find((r) => r.id === params.ruleId);
    if (!rule) return reply.code(404).send(errorBody("RATE_RULE_NOT_FOUND", "Kural bulunamadı."));
    await prisma.shippingRateRule.delete({ where: { id: rule.id } });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateRule",
      entityId: rule.id,
      metadata: { action: "deleteRule" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return shippingRatePlanSchema.parse(serializeRatePlan(reloaded!));
  });

  /* ───────────── Tier CRUD (DHL Tarife I/II/III) ───────────── */

  app.post("/stores/:storeId/shipping/rate-plans/:id/tiers", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRateTierInputSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    // Aylik gonderi araliklari cakismamali (deterministik tier secimi icin).
    const overlap = plan.tiers.some((t) =>
      rangesOverlap(input.monthlyShipmentMin ?? null, input.monthlyShipmentMax ?? null, t.monthlyShipmentMin, t.monthlyShipmentMax),
    );
    if (overlap) return reply.code(409).send(errorBody("TIER_RANGE_OVERLAP", "Segment aralığı mevcut bir segmentle çakışıyor."));
    await prisma.shippingRateTier.create({
      data: {
        ratePlanId: plan.id,
        name: input.name,
        monthlyShipmentMin: input.monthlyShipmentMin ?? null,
        monthlyShipmentMax: input.monthlyShipmentMax ?? null,
        sortOrder: input.sortOrder,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateTier",
      entityId: plan.id,
      metadata: { action: "addTier", name: input.name },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return reply.code(201).send(shippingRatePlanSchema.parse(serializeRatePlan(reloaded!)));
  });

  app.delete("/stores/:storeId/shipping/rate-plans/:id/tiers/:childId", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    const tier = plan.tiers.find((t) => t.id === params.childId);
    if (!tier) return reply.code(404).send(errorBody("TIER_NOT_FOUND", "Segment bulunamadı."));
    // Rule.tierId FK onDelete=SetNull: kurallar silinmez, tier baglantisi cozulur.
    await prisma.shippingRateTier.delete({ where: { id: tier.id } });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateTier",
      entityId: tier.id,
      metadata: { action: "deleteTier" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return shippingRatePlanSchema.parse(serializeRatePlan(reloaded!));
  });

  /* ───────────── Zone CRUD (Aras şehir-içi/yakın/kısa/orta/uzak/KKTC) ───────────── */

  app.post("/stores/:storeId/shipping/rate-plans/:id/zones", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingRateZoneInputSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    if (plan.zones.some((zoneRow) => zoneRow.code === input.code)) {
      return reply.code(409).send(errorBody("ZONE_CODE_DUPLICATE", "Bölge kodu bu tarifede zaten var."));
    }
    await prisma.shippingRateZone.create({
      data: {
        ratePlanId: plan.id,
        code: input.code,
        name: input.name,
        minDistanceKm: input.minDistanceKm ?? null,
        maxDistanceKm: input.maxDistanceKm ?? null,
        sortOrder: input.sortOrder,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateZone",
      entityId: plan.id,
      metadata: { action: "addZone", code: input.code },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return reply.code(201).send(shippingRatePlanSchema.parse(serializeRatePlan(reloaded!)));
  });

  app.delete("/stores/:storeId/shipping/rate-plans/:id/zones/:childId", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    const zone = plan.zones.find((zoneRow) => zoneRow.id === params.childId);
    if (!zone) return reply.code(404).send(errorBody("ZONE_NOT_FOUND", "Bölge bulunamadı."));
    await prisma.shippingRateZone.delete({ where: { id: zone.id } });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingRateZone",
      entityId: zone.id,
      metadata: { action: "deleteZone" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return shippingRatePlanSchema.parse(serializeRatePlan(reloaded!));
  });

  /* ───────────── Surcharge CRUD (SMS/güvence/mobil alan/hamaliye...) ───────────── */

  app.post("/stores/:storeId/shipping/rate-plans/:id/surcharges", async (request, reply) => {
    const params = planParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const input = shippingSurchargeInputSchema.parse(request.body);
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    if (plan.surcharges.some((s) => s.code === input.code)) {
      return reply.code(409).send(errorBody("SURCHARGE_CODE_DUPLICATE", "Ek hizmet kodu bu tarifede zaten var."));
    }
    await prisma.shippingSurcharge.create({
      data: {
        ratePlanId: plan.id,
        code: input.code,
        name: input.name,
        chargeType: input.chargeType,
        amountMinor: input.amountMinor ?? null,
        unitAmountMinor: input.unitAmountMinor ?? null,
        conditionJsonSafe: (input.conditionJsonSafe ?? null) as Prisma.InputJsonValue | undefined,
        isOptional: input.isOptional,
        sortOrder: input.sortOrder,
      },
    });
    await deps.recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingSurcharge",
      entityId: plan.id,
      metadata: { action: "addSurcharge", code: input.code },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return reply.code(201).send(shippingRatePlanSchema.parse(serializeRatePlan(reloaded!)));
  });

  app.delete("/stores/:storeId/shipping/rate-plans/:id/surcharges/:childId", async (request, reply) => {
    const params = childParam.parse(request.params);
    const access = await deps.requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const plan = await loadPlan(params.storeId, params.id);
    if (!plan) return reply.code(404).send(errorBody("RATE_PLAN_NOT_FOUND", "Tarife bulunamadı."));
    const surcharge = plan.surcharges.find((s) => s.id === params.childId);
    if (!surcharge) return reply.code(404).send(errorBody("SURCHARGE_NOT_FOUND", "Ek hizmet bulunamadı."));
    await prisma.shippingSurcharge.delete({ where: { id: surcharge.id } });
    await deps.recordAudit({
      action: "DELETE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "ShippingSurcharge",
      entityId: surcharge.id,
      metadata: { action: "deleteSurcharge" },
    });
    const reloaded = await loadPlan(params.storeId, params.id);
    return shippingRatePlanSchema.parse(serializeRatePlan(reloaded!));
  });
}
