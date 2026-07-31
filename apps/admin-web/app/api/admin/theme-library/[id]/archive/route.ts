import { type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyMutation(request, (t) => createApiClient().admin.themeLibrary.archive(id, t), { noBody: true });
}
