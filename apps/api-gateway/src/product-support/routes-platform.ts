/**
 * TODO-177 (ADR-289) — Ürün Desteği Platform Admin question-set yönetim rotaları.
 * `/platform/support/*`. Guard: requirePlatform (SUPER_ADMIN/platform). Store MUTATE EDEMEZ
 * (bu rotalar store-admin auth kabul etmez). Publish-time graph validation zorunlu.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  platformSupportQuestionSetCreateRequestSchema,
  platformSupportQuestionSetUpdateRequestSchema,
  platformSupportVersionCreateRequestSchema,
  platformSupportVersionEditRequestSchema,
  platformSupportMappingUpsertRequestSchema,
  platformSupportTopicDefaultUpsertRequestSchema,
  platformSupportQuestionSetListResponseSchema,
  platformSupportQuestionSetDetailResponseSchema,
  platformSupportGraphValidationResponseSchema,
} from "@commerce-os/contracts";
import {
  listQuestionSets,
  createQuestionSet,
  getQuestionSetDetail,
  updateQuestionSet,
  createVersion,
  editDraftVersion,
  validateVersion,
  publishVersion,
  archiveVersion,
  upsertMapping,
  deleteMapping,
  upsertTopicDefault,
} from "./question-service.js";

export interface SupportPlatformRoutesDeps {
  requirePlatform: (request: FastifyRequest, reply: FastifyReply) => Promise<{ actorUserId: string } | null>;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

const idParam = z.object({ id: z.string().min(1) });
const versionParam = z.object({ versionId: z.string().min(1) });
const storeIdParam = z.object({ storeId: z.string().min(1) });

export function registerSupportPlatformRoutes(app: FastifyInstance, deps: SupportPlatformRoutesDeps): void {
  async function guard(request: FastifyRequest, reply: FastifyReply) {
    return deps.requirePlatform(request, reply);
  }

  app.get("/platform/support/question-sets", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const items = await listQuestionSets();
    return reply.send(platformSupportQuestionSetListResponseSchema.parse({ items }));
  });

  app.post("/platform/support/question-sets", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const input = platformSupportQuestionSetCreateRequestSchema.parse(request.body);
    const result = await createQuestionSet(input);
    if (!result.ok) return reply.code(409).send(errorBody(result.code, "Bu anahtar zaten kullanılıyor."));
    const detail = await getQuestionSetDetail(result.id);
    return reply.code(201).send(platformSupportQuestionSetDetailResponseSchema.parse({ questionSet: detail }));
  });

  app.get("/platform/support/question-sets/:id", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { id } = idParam.parse(request.params);
    const detail = await getQuestionSetDetail(id);
    if (!detail) return reply.code(404).send(errorBody("NOT_FOUND", "Soru seti bulunamadı."));
    return reply.send(platformSupportQuestionSetDetailResponseSchema.parse({ questionSet: detail }));
  });

  app.patch("/platform/support/question-sets/:id", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { id } = idParam.parse(request.params);
    const input = platformSupportQuestionSetUpdateRequestSchema.parse(request.body);
    const result = await updateQuestionSet(id, input);
    if (!result.ok) return reply.code(404).send(errorBody(result.code, "Soru seti bulunamadı."));
    const detail = await getQuestionSetDetail(id);
    return reply.send(platformSupportQuestionSetDetailResponseSchema.parse({ questionSet: detail }));
  });

  app.post("/platform/support/question-sets/:id/versions", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { id } = idParam.parse(request.params);
    const input = platformSupportVersionCreateRequestSchema.parse(request.body);
    const result = await createVersion(id, input.cloneFromVersionId);
    if (!result.ok) return reply.code(404).send(errorBody(result.code, "Soru seti bulunamadı."));
    const detail = await getQuestionSetDetail(id);
    return reply.code(201).send(platformSupportQuestionSetDetailResponseSchema.parse({ questionSet: detail }));
  });

  app.patch("/platform/support/versions/:versionId", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { versionId } = versionParam.parse(request.params);
    const input = platformSupportVersionEditRequestSchema.parse(request.body);
    const result = await editDraftVersion(versionId, {
      questions: input.questions,
      transitions: input.transitions,
    });
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 409;
      return reply.code(status).send(errorBody(result.code, result.code === "NOT_DRAFT" ? "Yalnız DRAFT düzenlenebilir." : "Versiyon bulunamadı."));
    }
    return reply.send({ ok: true });
  });

  app.post("/platform/support/versions/:versionId/validate", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { versionId } = versionParam.parse(request.params);
    const result = await validateVersion(versionId);
    return reply.send(platformSupportGraphValidationResponseSchema.parse({ ok: result.ok, errors: result.errors }));
  });

  app.post("/platform/support/versions/:versionId/publish", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { versionId } = versionParam.parse(request.params);
    const result = await publishVersion(versionId);
    if (!result.ok) {
      if (result.code === "NOT_FOUND") return reply.code(404).send(errorBody(result.code, "Versiyon bulunamadı."));
      if (result.code === "GRAPH_INVALID")
        return reply.code(422).send({
          error: {
            code: result.code,
            message: "Soru grafiği geçersiz.",
            details: { errors: result.errors ?? [] },
          },
        });
      return reply.code(409).send(errorBody(result.code, "Yalnız DRAFT yayınlanabilir."));
    }
    return reply.send({ ok: true });
  });

  app.post("/platform/support/versions/:versionId/archive", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { versionId } = versionParam.parse(request.params);
    const result = await archiveVersion(versionId);
    if (!result.ok) return reply.code(409).send(errorBody(result.code, "Yalnız PUBLISHED arşivlenebilir."));
    return reply.send({ ok: true });
  });

  app.put("/platform/support/stores/:storeId/mappings", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { storeId } = storeIdParam.parse(request.params);
    const input = platformSupportMappingUpsertRequestSchema.parse(request.body);
    const result = await upsertMapping(storeId, input);
    if (!result.ok) return reply.code(404).send(errorBody(result.code, "Soru seti bulunamadı."));
    return reply.send({ ok: true });
  });

  app.delete("/platform/support/stores/:storeId/mappings", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const { storeId } = storeIdParam.parse(request.params);
    const input = platformSupportMappingUpsertRequestSchema
      .omit({ questionSetId: true })
      .parse(request.body);
    await deleteMapping(storeId, input);
    return reply.send({ ok: true });
  });

  app.put("/platform/support/topic-defaults", async (request, reply) => {
    if (!(await guard(request, reply))) return;
    const input = platformSupportTopicDefaultUpsertRequestSchema.parse(request.body);
    const result = await upsertTopicDefault(input);
    if (!result.ok) return reply.code(404).send(errorBody(result.code, "Soru seti bulunamadı."));
    return reply.send({ ok: true });
  });
}
