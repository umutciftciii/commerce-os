import { type NextRequest } from "next/server";
import { createApiClient, type PlatformRequestStatusRequest } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().platformRequests.platform.status(id, b as PlatformRequestStatusRequest, t),
  );
}
