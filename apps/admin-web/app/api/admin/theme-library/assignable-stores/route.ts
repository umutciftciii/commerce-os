import { type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { proxyGet } from "../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  proxyGet(request, (t) => createApiClient().admin.themeLibrary.assignableStores(t));
