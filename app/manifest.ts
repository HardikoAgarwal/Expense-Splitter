import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hissa",
    short_name: "Hissa",
    description: "Split rent, groceries, and the rest of a shared home.",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ec",
    theme_color: "#1f6b4a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
