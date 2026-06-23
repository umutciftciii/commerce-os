export const dynamic = "force-dynamic";

// Lightweight liveness endpoint for the store-admin-web app itself.
export function GET() {
  return Response.json({
    status: "ok",
    service: "store-admin-web",
    timestamp: new Date().toISOString(),
  });
}
