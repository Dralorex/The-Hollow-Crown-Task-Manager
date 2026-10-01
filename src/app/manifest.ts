import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rowgon Task Manager",
    short_name: "Rowgon",
    description:
      "Nested folders, urgency that pulls due tasks up, friends, and private chats.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FDFBF5",
    theme_color: "#0A3D45",
    icons: [
      {
        src: "/brand/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/brand/rowgon-mark.png",
        sizes: "256x256",
        type: "image/png",
      },
      {
        src: "/brand/rowgon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
