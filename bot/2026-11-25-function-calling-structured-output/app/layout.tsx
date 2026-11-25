import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './styles.css';

export const metadata: Metadata = {
  title: '工具调用与结构化输出 · 离线实验',
  description: 'AI SDK 三家 provider 的请求映射与 core 行为实测',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
