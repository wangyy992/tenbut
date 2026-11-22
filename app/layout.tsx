import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "满分，但是。｜朋友局意见分裂现场",
  description: "TA 是满分，但是……你还给几分？和朋友一起抽题、打分、揭晓。满分女、满分男、追星线下三种玩法。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
