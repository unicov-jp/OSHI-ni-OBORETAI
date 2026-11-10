import type { MetadataRoute } from "next";

// ホーム画面に追加したときの名前とアイコン。新着(黒い画面)から始まるので、色も黒にそろえる。
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "推しに溺れたい",
    short_name: "推しに溺れたい",
    description: "推しのSNS・Blogの新着を、推しごとにスワイプで追いかける「推しに溺れたい」",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ja",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
