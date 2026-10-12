/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for a small Docker image.
  output: "standalone",
  // src/instrumentation.ts schedules the leave-expiry reminder emails.
  experimental: {
    instrumentationHook: true,
    // Load the Postgres client from node_modules at runtime instead of bundling it.
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
