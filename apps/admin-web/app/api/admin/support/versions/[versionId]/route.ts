import { type NextRequest } from "next/server";
import { createApiClient, type PlatformSupportVersionEditRequest } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.support.editVersion(versionId, b as PlatformSupportVersionEditRequest, t),
  );
}
