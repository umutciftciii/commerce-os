import { type NextRequest } from "next/server";
import { createApiClient, type LibraryTemplateCreateRequest } from "@commerce-os/api-client";
import { proxyGet, proxyMutation } from "../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

// TODO-164B Dilim 2 — Platform Tema Kütüphanesi liste (GET) + template oluştur (POST).
export const GET = (request: NextRequest) =>
  proxyGet(request, (t) => createApiClient().admin.themeLibrary.list(t));

export const POST = (request: NextRequest) =>
  proxyMutation(request, (t, b) =>
    createApiClient().admin.themeLibrary.create(b as LibraryTemplateCreateRequest, t),
  );
