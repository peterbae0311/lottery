import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-noto-sans-kr',
});

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
      <body className={`${notoSansKR.variable} min-h-full bg-white text-gray-900 antialiased`} style={{ fontFamily: 'var(--font-noto-sans-kr), sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
