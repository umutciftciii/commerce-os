import { type NextRequest } from "next/server";
import { createApiClient, type PlatformSupportQuestionSetCreateRequest } from "@commerce-os/api-client";
import { proxyGet, proxyMutation } from "../../../../../lib/server/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  proxyGet(request, (t) => createApiClient().admin.support.list(t));

export const POST = (request: NextRequest) =>
  proxyMutation(request, (t, b) =>
    createApiClient().admin.support.create(b as PlatformSupportQuestionSetCreateRequest, t),
  );
