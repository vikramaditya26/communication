import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vaani",
    short_name: "Vaani",
    description: "Read books out loud and practice your English.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#13110f",
    theme_color: "#13110f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Speak", url: "/speak", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Sounds", url: "/sounds", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Review", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
