import { type NextRequest } from "next/server";
import { createApiClient, type PlatformRequestInboxQuery } from "@commerce-os/api-client";
import { proxyGet } from "../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const query: PlatformRequestInboxQuery = {
    status: sp.get("status") ?? undefined,
    priority: sp.get("priority") ?? undefined,
    categoryKey: sp.get("categoryKey") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    storeId: sp.get("storeId") ?? undefined,
    slaRisk: (sp.get("slaRisk") as "true" | "false" | null) ?? undefined,
    search: sp.get("search") ?? undefined,
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
    pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
  };
  return proxyGet(request, (t) => createApiClient().platformRequests.platform.list(query, t));
};
