// TODO-165 Fashion Vertical (ADR-249) — Size Chart prisma veri erisimi.
//
// Tum sorgular store-scoped ({id, storeId}); baska magazanin chart'i GORUNMEZ. Publish,
// advisory-lock'lu tek $transaction icinde sonraki revision no'yu atomik uretir (yaris
// kosulunda dubleks revision engellenir). columns/rows JSON kolonlari typed'a cevrilir.

import { prisma } from "@commerce-os/db";
import type {
  SizeChartAssignmentRecord,
  SizeChartColumn,
  SizeChartDataAccess,
  SizeChartRecord,
  SizeChartRevisionRecord,
  SizeChartRow,
  SizeChartScope,
  SizeChartStatus,
} from "./size-chart-service.js";

function asColumns(value: unknown): SizeChartColumn[] {
  return Array.isArray(value) ? (value as SizeChartColumn[]) : [];
}
function asRows(value: unknown): SizeChartRow[] {
  return Array.isArray(value) ? (value as SizeChartRow[]) : [];
}

type ChartRow = {
  id: string;
  storeId: string;
  name: string;
  sizeSystemKey: string;
  measurementUnit: string;
  gender: string | null;
  locale: string | null;
  status: string;
  publishedRevisionId: string | null;
  draftColumns: unknown;
  draftRows: unknown;
  createdAt: Date;
  updatedAt: Date;
  revisions?: {
    id: string;
    revision: number;
    columns: unknown;
    rows: unknown;
    locale: string | null;
    createdAt: Date;
  }[];
  assignments?: { id: string; scope: string; categoryId: string | null; productId: string | null }[];
};

function mapRevision(r: NonNullable<ChartRow["revisions"]>[number]): SizeChartRevisionRecord {
  return {
    id: r.id,
    revision: r.revision,
    columns: asColumns(r.columns),
    rows: asRows(r.rows),
    locale: r.locale,
    createdAt: r.createdAt,
  };
}

function mapChart(row: ChartRow): SizeChartRecord {
  const published = row.publishedRevisionId
    ? row.revisions?.find((r) => r.id === row.publishedRevisionId) ?? null
    : null;
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    sizeSystemKey: row.sizeSystemKey,
    measurementUnit: row.measurementUnit,
    gender: row.gender,
    locale: row.locale,
    status: row.status as SizeChartStatus,
    publishedRevisionId: row.publishedRevisionId,
    draftColumns: asColumns(row.draftColumns),
    draftRows: asRows(row.draftRows),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedRevision: published ? mapRevision(published) : null,
    assignments: row.assignments?.map(
      (a): SizeChartAssignmentRecord => ({
        id: a.id,
        scope: a.scope as SizeChartScope,
        categoryId: a.categoryId,
        productId: a.productId,
      }),
    ),
  };
}

const includeDetail = { revisions: true, assignments: true } as const;

export function createPrismaSizeChartDataAccess(): SizeChartDataAccess {
  return {
    async list(storeId) {
      const rows = await prisma.sizeChart.findMany({
        where: { storeId },
        include: includeDetail,
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => mapChart(r as unknown as ChartRow));
    },

    async get(storeId, id) {
      const row = await prisma.sizeChart.findFirst({
        where: { id, storeId },
        include: includeDetail,
      });
      return row ? mapChart(row as unknown as ChartRow) : null;
    },

    async create(input) {
      const row = await prisma.sizeChart.create({
        data: {
          storeId: input.storeId,
          name: input.name,
          sizeSystemKey: input.sizeSystemKey,
          measurementUnit: input.measurementUnit,
          gender: input.gender,
          locale: input.locale,
          draftColumns: input.draftColumns as unknown as object,
          draftRows: input.draftRows as unknown as object,
        },
        include: includeDetail,
      });
      return mapChart(row as unknown as ChartRow);
    },

    async updateDraft(storeId, id, patch) {
      // storeId guard: updateMany-benzeri koruma icin once findFirst (route zaten guard'li).
      const row = await prisma.sizeChart.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.measurementUnit !== undefined ? { measurementUnit: patch.measurementUnit } : {}),
          ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
          ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
          ...(patch.draftColumns !== undefined
            ? { draftColumns: patch.draftColumns as unknown as object }
            : {}),
          ...(patch.draftRows !== undefined ? { draftRows: patch.draftRows as unknown as object } : {}),
        },
        include: includeDetail,
      });
      return mapChart(row as unknown as ChartRow);
    },

    async publish(storeId, id, snapshot) {
      return prisma.$transaction(async (tx) => {
        // Advisory lock: bu chart icin revision numaralandirmayi serilestir.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sizechart:${id}`}))`;
        const last = await tx.sizeChartRevision.findFirst({
          where: { sizeChartId: id, storeId },
          orderBy: { revision: "desc" },
          select: { revision: true },
        });
        const nextRevision = (last?.revision ?? 0) + 1;
        const rev = await tx.sizeChartRevision.create({
          data: {
            storeId,
            sizeChartId: id,
            revision: nextRevision,
            columns: snapshot.columns as unknown as object,
            rows: snapshot.rows as unknown as object,
            locale: snapshot.locale,
          },
        });
        const row = await tx.sizeChart.update({
          where: { id },
          data: { status: "PUBLISHED", publishedRevisionId: rev.id },
          include: includeDetail,
        });
        return mapChart(row as unknown as ChartRow);
      });
    },

    async getRevision(storeId, chartId, revisionId) {
      const r = await prisma.sizeChartRevision.findFirst({
        where: { id: revisionId, sizeChartId: chartId, storeId },
      });
      return r ? mapRevision(r as unknown as NonNullable<ChartRow["revisions"]>[number]) : null;
    },

    async setStatus(storeId, id, status) {
      const row = await prisma.sizeChart.update({
        where: { id },
        data: { status },
        include: includeDetail,
      });
      return mapChart(row as unknown as ChartRow);
    },

    async rollback(storeId, id, revision) {
      const row = await prisma.sizeChart.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedRevisionId: revision.id,
          draftColumns: revision.columns as unknown as object,
          draftRows: revision.rows as unknown as object,
        },
        include: includeDetail,
      });
      return mapChart(row as unknown as ChartRow);
    },

    async upsertAssignment(input) {
      // Ayni scope-hedefi icin tekil (unique index). categoryId/productId NULL-distinct
      // oldugundan STORE-scope tekilligi: once ayni scope satirini bul, yoksa yarat.
      const existing = await prisma.sizeChartAssignment.findFirst({
        where: {
          storeId: input.storeId,
          sizeChartId: input.sizeChartId,
          scope: input.scope,
          categoryId: input.categoryId,
          productId: input.productId,
        },
      });
      const row =
        existing ??
        (await prisma.sizeChartAssignment.create({
          data: {
            storeId: input.storeId,
            sizeChartId: input.sizeChartId,
            scope: input.scope,
            categoryId: input.categoryId,
            productId: input.productId,
          },
        }));
      return { id: row.id, scope: row.scope as typeof input.scope, categoryId: row.categoryId, productId: row.productId };
    },

    async removeAssignment(storeId, sizeChartId, assignmentId) {
      await prisma.sizeChartAssignment.deleteMany({
        where: { id: assignmentId, storeId, sizeChartId },
      });
    },

    async categoryExists(storeId, categoryId) {
      const c = await prisma.productCategory.findFirst({ where: { id: categoryId, storeId }, select: { id: true } });
      return !!c;
    },

    async productExists(storeId, productId) {
      const p = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
      return !!p;
    },
  };
}
