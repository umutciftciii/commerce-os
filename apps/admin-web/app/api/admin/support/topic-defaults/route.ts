import { type NextRequest } from "next/server";
import { createApiClient, type PlatformSupportTopicDefaultUpsertRequest } from "@commerce-os/api-client";
import { proxyMutation } from "../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const PUT = (request: NextRequest) =>
  proxyMutation(request, (t, b) =>
    createApiClient().admin.support.upsertTopicDefault(b as PlatformSupportTopicDefaultUpsertRequest, t),
  );
