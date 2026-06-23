import { join } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@commerce-os/ui", "@commerce-os/i18n"],
  eslint: { ignoreDuringBuilds: true },
  // Pin file-tracing to the monorepo root (two levels up) so Next doesn't have
  // to infer it from multiple lockfiles. Portable between worktree and main.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
};

export default nextConfig;
