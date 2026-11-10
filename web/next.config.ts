import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function supabaseOrigins(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return `${url.origin} wss://${url.host}`;
  } catch {
    return "";
  }
}

// 読み込みを許可する外部の範囲を明示する。埋め込みは各SNSの公式ドメインだけ。
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://platform.twitter.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.ytimg.com https://*.twimg.com https://platform.twitter.com https://syndication.twitter.com",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}${isDev ? " ws:" : ""}`,
  "frame-src https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https://platform.twitter.com https://syndication.twitter.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
