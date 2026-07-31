import { type NextRequest } from "next/server";
import { createApiClient, type ThemeUpdateRequest } from "@commerce-os/api-client";
import { proxyGet, proxyMutation } from "../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(request, (t) => createApiClient().admin.themeLibrary.get(id, t));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.themeLibrary.updateMeta(id, b as ThemeUpdateRequest, t),
  );
}
