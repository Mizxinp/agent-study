import type { ReactNode } from "react";
import "./styles.css";

export const metadata = { title: "冻结轨迹评测" };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="zh-Hans"><body>{children}</body></html>;
}
