export const dynamic = "force-dynamic";

// Lightweight liveness endpoint for the admin-web app itself (not the API gateway).
export function GET() {
  return Response.json({
    status: "ok",
    service: "admin-web",
    timestamp: new Date().toISOString(),
  });
}
