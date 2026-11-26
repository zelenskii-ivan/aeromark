import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Защитные заголовки отдаёт сам Next, а не прокси. Раньше они были записаны
 * только в Caddyfile, а на сервере стоит nginx — и на сайт не приходил ни
 * один из них.
 *
 * Внешних скриптов и шрифтов приложение не грузит. 'unsafe-inline' нужен Next
 * для гидрации и инлайн-стилей, blob: — для текстур 3D-моделей (и в img-src, и в connect-src), 'unsafe-eval'
 * — только в разработке (горячая перезагрузка).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  // blob: и data: — GLTFLoader читает текстуры моделей через fetch.
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small: `next build` emits a
  // self-contained server with only the modules it actually imports.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
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
