import { type NextRequest } from "next/server";
import { createApiClient, type PlatformSupportMappingUpsertRequest } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.support.upsertMapping(storeId, b as PlatformSupportMappingUpsertRequest, t),
  );
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.support.deleteMapping(
      storeId,
      b as Omit<PlatformSupportMappingUpsertRequest, "questionSetId">,
      t,
    ),
  );
}
