import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    // A warm build cache shipped stale Tailwind CSS (old theme tokens) after
    // globals.css changed. Hosts like Vercel restore .next/cache between
    // deploys, so production builds compile CSS fresh every time.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
