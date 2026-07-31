import { type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { proxyGet } from "../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet(request, (t) => createApiClient().admin.themeLibrary.usage(id, t));
}
