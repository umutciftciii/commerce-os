import { type NextRequest } from "next/server";
import { createApiClient, type PlatformSupportQuestionSetUpdateRequest } from "@commerce-os/api-client";
import { proxyGet, proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(request, (t) => createApiClient().admin.support.get(id, t));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.support.update(id, b as PlatformSupportQuestionSetUpdateRequest, t),
  );
}
