import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ConnectionBanner } from '@/components/layout/status-banners';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Tiến Lên Online',
    template: '%s · Tiến Lên Online',
  },
  description: 'Chơi Tiến Lên Miền Nam trực tuyến cùng bạn bè. Xu trong game chỉ là điểm ảo.',
  applicationName: 'Tiến Lên Online',
  appleWebApp: {
    capable: true,
    title: 'Tiến Lên',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#073823',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:font-semibold focus:text-felt-950"
        >
          Bỏ qua đến nội dung chính
        </a>
        <ConnectionBanner />
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
