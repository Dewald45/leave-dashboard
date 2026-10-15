/**
 * Absolute URL on the public site, for redirects from route handlers.
 *
 * Behind the proxy, `request.url` reflects the container's own address
 * (`0.0.0.0:3000`), so redirects built from it send browsers nowhere. Use the
 * configured APP_URL instead (also safer than trusting forwarded headers);
 * fall back to the request only when APP_URL isn't set (local development).
 */
export function publicUrl(path: string, request: Request): URL {
  return new URL(path, process.env.APP_URL || request.url);
}
