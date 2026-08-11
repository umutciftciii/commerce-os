import { type NextRequest } from "next/server";
import { createApiClient, type PlatformUserDirectoryQuery } from "@commerce-os/api-client";
import { proxyGet } from "../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const query: PlatformUserDirectoryQuery = {
    search: sp.get("search") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
  };
  return proxyGet(request, (t) => createApiClient().platformRequests.platform.users(query, t));
};
