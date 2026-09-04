import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public pilot is a static export. The full account-enabled build stays
  // on the `improvements` branch for deployment to the future VPS.
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_SYNC_ENABLED: "0",
  },
};

export default nextConfig;
