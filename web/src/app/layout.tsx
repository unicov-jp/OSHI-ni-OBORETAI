import type { Metadata, Viewport } from "next";
import "@fontsource/dela-gothic-one/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "推しに溺れたい", template: "%s | 推しに溺れたい" },
  description: "推しのSNSとBlogを、ひとりずつ1つのタブにまとめて追いかけるためのアプリ。",
  applicationName: "推しに溺れたい",
  // ホーム画面に追加したときの名前(iPhone)とアイコン
  appleWebApp: { capable: true, title: "推しに溺れたい", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png?v=2", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 画面の端(ノッチ・ホームバーの下)まで使い、はみ出す分は safe-area で避ける
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

// 背景の明るさは新着の画面と同じ暗い表示に固定する
const themeScript = `document.documentElement.classList.add("js")`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
