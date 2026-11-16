import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "LangGraph Store vs Checkpointer",
  description:
    "演示 LangGraph Checkpointer（线程状态）与 Store（跨线程 KV）两层 persistence。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
