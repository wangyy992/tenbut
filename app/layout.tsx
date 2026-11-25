import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./i18n";
import VisitTracker from './visit-tracker';

export const metadata: Metadata = {
  title: "满分，但是。｜盲抽猜分默契局",
  description: "A 盲抽分数，B 看牌描述，A 猜中数字就算默契对上。支持情境灵感、自定义描述和语音转文字。",
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
      <body className="antialiased"><I18nProvider><VisitTracker/>{children}</I18nProvider></body>
    </html>
  );
}
