import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tiến Lên Online',
    short_name: 'Tiến Lên',
    description: 'Chơi Tiến Lên Miền Nam trực tuyến cùng bạn bè. Xu trong game chỉ là điểm ảo.',
    lang: 'vi',
    dir: 'ltr',
    start_url: '/lobby',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#04261a',
    theme_color: '#073823',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
