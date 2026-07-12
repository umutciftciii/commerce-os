import { join } from "node:path";

// ADR-065 — Yuklenen gorsellerin public URL'i MEDIA_PUBLIC_BASE_URL bos oldugunda
// goreli uretilir (/media/...). Statik serve api-gateway'de (@fastify/static /media/*)
// calisir; bu app farkli bir origin oldugundan goreli path tarayicida bu app'in
// origin'ine coozulur ve 404 olur. Rewrite, /media/* isteklerini SUNUCU-TARAFINDA
// gateway'e proxy'ler (mevcut BFF deseniyle ayni: tarayici yalnizca bu origin'le
// konusur, gateway'e API_GATEWAY_URL uzerinden erisilir). Prod'da MEDIA_PUBLIC_BASE_URL
// bir CDN'e ayarlaninca URL'ler mutlak olur ve bu rewrite dogal olarak devre disi kalir.
const gatewayUrl = process.env.API_GATEWAY_URL?.trim() || "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@commerce-os/ui", "@commerce-os/i18n"],
  eslint: { ignoreDuringBuilds: true },
  // Pin file-tracing to the monorepo root (two levels up) so Next doesn't have
  // to infer it from multiple lockfiles. Portable between worktree and main.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${gatewayUrl}/media/:path*` }];
  },
};

export default nextConfig;
