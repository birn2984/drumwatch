import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DrumWatch | ドラム式洗濯機の価格比較',
  description: '2人暮らし向けドラム式洗濯乾燥機の価格追跡',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
