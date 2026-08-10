import { type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { proxyGet } from "../../../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  return proxyGet(request, (t) =>
    createApiClient().admin.categories.selector(storeId, t, { search, limit: 20 }),
  );
}
