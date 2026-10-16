/** @type {import('next').NextConfig} */
// Sent with every response. No full Content-Security-Policy yet (Next's inline
// scripts need nonces); frame-ancestors alone stops the app being framed.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  // Emit a self-contained server bundle for a small Docker image.
  output: "standalone",
  experimental: {
    // Runs src/instrumentation.ts on boot — schedules the leave-expiry and
    // approval-reminder jobs.
    instrumentationHook: true,
    // Load the Postgres client from node_modules at runtime instead of bundling it.
    serverComponentsExternalPackages: ["pg"],
    // Sick notes and thread attachments go through server actions (5 MB cap
    // enforced in src/lib/attachments.ts; the default limit is 1 MB).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
