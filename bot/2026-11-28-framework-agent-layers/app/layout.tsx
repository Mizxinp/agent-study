import type { ReactNode } from 'react';
import './styles.css';

export const metadata = { title: 'AI SDK 智能体分层实验' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
