import type { ReactNode } from 'react';

export const metadata = { title: '3.2 评测工具与 CI 闸门' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
