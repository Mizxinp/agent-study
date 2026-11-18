export const metadata = { title: "Agentic RAG 循环 vs 固定 RAG" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "24px auto", padding: "0 16px" }}>{children}</body>
    </html>
  );
}
