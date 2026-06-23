import { join } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @commerce-os/ui ships TypeScript source and is transpiled by the app.
  transpilePackages: ["@commerce-os/ui"],
  // Linting is run repo-wide via `pnpm lint`; don't duplicate it during build.
  eslint: { ignoreDuringBuilds: true },
  // Pin file-tracing to the monorepo root (two levels up) so Next doesn't have
  // to infer it from multiple lockfiles. Portable between worktree and main.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
};

export default nextConfig;
