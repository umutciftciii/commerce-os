import { type NextRequest } from "next/server";
import { createApiClient, type PlatformRequestCategoryCreateRequest } from "@commerce-os/api-client";
import { proxyGet, proxyMutation } from "../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  proxyGet(request, (t) => createApiClient().platformRequests.categories.list(t));

export const POST = (request: NextRequest) =>
  proxyMutation(request, (t, b) =>
    createApiClient().platformRequests.categories.create(b as PlatformRequestCategoryCreateRequest, t),
  );
