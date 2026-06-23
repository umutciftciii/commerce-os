export const dynamic = "force-dynamic";

// Lightweight liveness endpoint for the storefront-web app itself.
export function GET() {
  return Response.json({
    status: "ok",
    service: "storefront-web",
    timestamp: new Date().toISOString(),
  });
}
