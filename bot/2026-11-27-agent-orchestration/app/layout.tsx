import type { ReactNode } from 'react';

export const metadata = { title: '德化陶瓷店客服编排实验' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body style={{ background: '#f4f0e8', color: '#20231f', margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body></html>;
}
