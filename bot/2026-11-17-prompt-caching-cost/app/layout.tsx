import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Prompt caching 成本与断点实测",
  description:
    "用真实 API usage 验证 Anthropic / OpenAI Prompt caching 断点位置与成本，以及 Vercel AI SDK 对 cache 字段的映射。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
