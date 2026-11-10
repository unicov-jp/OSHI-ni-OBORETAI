import type { Metadata, Viewport } from "next";
import "@fontsource/dela-gothic-one/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "推しに溺れたい", template: "%s | 推しに溺れたい" },
  description: "推しのSNSとBlogを、ひとりずつ1つのタブにまとめて追いかけるためのアプリ。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#06141f" },
  ],
};

// 描画前にテーマを決める(切り替え時のちらつき防止)。保存がなければ端末の設定に合わせる。
const themeScript = `(function(){document.documentElement.classList.add("js");try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
