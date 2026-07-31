import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OneCall AI',
  description: 'AI on-call assistant powered by LangChain and LangGraph',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
