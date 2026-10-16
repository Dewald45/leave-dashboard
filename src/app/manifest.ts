import type { MetadataRoute } from "next";

/** Lets people add TimeOff to their phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TimeOff",
    short_name: "TimeOff",
    description: "Media Rocket's leave: apply, approve and see what you have left.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#f5f5f5",
    icons: [
      { src: "/app-icon/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
