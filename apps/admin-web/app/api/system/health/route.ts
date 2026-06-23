import { NextResponse } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Public gateway sağlık + sürüm bilgisini proxy'ler (token gerektirmez). */
export async function GET() {
  try {
    const client = createApiClient();
    const [health, version] = await Promise.all([client.health(), client.version()]);
    return NextResponse.json({ health, version, gatewayUrl: client.baseUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
