import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '로또 번호 분석',
  description: '로또 1등 당첨 번호 분석 및 예상 번호 추출',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
