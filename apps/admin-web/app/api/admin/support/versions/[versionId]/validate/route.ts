import { type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  return proxyMutation(request, (t) => createApiClient().admin.support.validateVersion(versionId, t), { noBody: true });
}
