import { type NextRequest } from "next/server";
import { createApiClient, type ThemePolicyUpdateRequest } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyMutation(request, (t, b) =>
    createApiClient().admin.themeLibrary.setPolicy(id, b as ThemePolicyUpdateRequest, t),
  );
}
