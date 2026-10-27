import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tiến Lên Online',
    template: '%s · Tiến Lên Online',
  },
  description: 'Chơi Tiến Lên Miền Nam trực tuyến cùng bạn bè. Xu trong game chỉ là điểm ảo.',
  applicationName: 'Tiến Lên Online',
};

export const viewport: Viewport = {
  themeColor: '#073823',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
