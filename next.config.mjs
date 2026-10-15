/** @type {import('next').NextConfig} */
const nextConfig = {
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
