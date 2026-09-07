import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small: `next build` emits a
  // self-contained server with only the modules it actually imports.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The service worker must never be served from a stale HTTP cache,
        // otherwise a deploy cannot roll a new cache version out.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
