# syntax=docker/dockerfile:1
# Shared local dev/smoke image for every Node workspace (api-gateway, worker,
# admin-web, store-admin-web, storefront-web). Each compose service runs its own
# `pnpm --filter <ws> dev`; production image optimization is out of scope
# (see docs/DECISIONS.md ADR-019).
#
# TODO-137 — deterministic clean build:
#   * Dependencies are installed from the committed lockfile IN-IMAGE.
#   * The Prisma client and every shared package `dist/` are produced IN-IMAGE.
#   * Host-generated artifacts (dist/.next/node_modules/prisma client) are kept
#     out of the build context via .dockerignore, so no stale host output can
#     leak in. Result: `docker build` succeeds from a clean checkout with no
#     "pnpm build on host first" workaround.
FROM node:22-alpine

WORKDIR /app

# pnpm via corepack; version is pinned by the root package.json "packageManager".
RUN corepack enable

# --- Source + manifests -----------------------------------------------------
# Root workspace/build config first, then the workspaces. Every package.json is
# needed so pnpm can resolve the workspace graph. Generated outputs are excluded
# by .dockerignore, so these COPYs bring source only.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services

# --- Install (deterministic, from lockfile) ---------------------------------
# A pnpm store cache mount keeps repeat builds fast without baking the store
# into the image layers.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

# --- Build shared artifacts IN-IMAGE ----------------------------------------
# 1) Prisma client (writes into node_modules/.prisma) — required before the db
#    package is type-compiled.
# 2) Every shared workspace package `dist/`. Backend apps run from source via
#    `tsx watch` and Next apps run `next dev`, so no prebuilt app bundle is
#    needed — but both import the shared packages from their compiled `dist/`,
#    which therefore MUST be built here (host dist is .dockerignore'd out).
RUN pnpm db:generate
RUN pnpm exec turbo run build --filter="./packages/*"

EXPOSE 3000
