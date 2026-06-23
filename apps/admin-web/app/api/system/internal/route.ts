import { NextResponse, type NextRequest } from "next/server";
import { ApiError, createApiClient, type InternalHealthResponse } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../lib/server/session";
import { unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

type Probe = "ok" | "degraded" | "unknown";

async function probe(call: () => Promise<InternalHealthResponse>): Promise<Probe> {
  try {
    const result = await call();
    return result.status === "ok" ? "ok" : "degraded";
  } catch (error) {
    // Gateway 503 -> bileşen sorunlu; diğer hatalarda durum bilinmiyor.
    if (error instanceof ApiError && error.status === 503) return "degraded";
    return "unknown";
  }
}

/**
 * Dahili DB/Redis sağlık durumunu döner. Internal token YALNIZCA sunucu env'inde
 * (`INTERNAL_API_TOKEN`) tutulur; istemciye veya client bundle'a hiç girmez.
 * Token tanımlı değilse `available: false` döner ve UI "dahili token gerektirir"
 * durumunu gösterir. Sadece oturum açmış admin erişebilir.
 */
export async function GET(request: NextRequest) {
  const sessionToken = getSessionToken(request);
  if (!sessionToken) {
    return unauthorizedResponse();
  }

  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) {
    return NextResponse.json({ available: false });
  }

  const client = createApiClient();
  const [db, redis] = await Promise.all([
    probe(() => client.internal.dbHealth(internalToken)),
    probe(() => client.internal.redisHealth(internalToken)),
  ]);
  return NextResponse.json({ available: true, db, redis });
}
