import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './style.css';

export const metadata: Metadata = {
  title: 'OpenAI Evals 导入对照',
  description: 'Promptfoo 0.126.0 冻结夹具实验结果',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
