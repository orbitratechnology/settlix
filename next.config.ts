import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  partialPrefetching: true,
  reactCompiler: true,
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
