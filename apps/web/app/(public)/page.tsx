import Link from 'next/link';

// Phase 1 placeholder. The full landing page (Flow A) is built in Phase 2.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="space-y-3">
        <p className="text-sm font-semibold tracking-widest text-gold-400 uppercase">
          Đang phát triển
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Tiến Lên Online</h1>
        <p className="text-lg text-white/80">
          Tiến Lên Miền Nam trực tuyến cho bốn người chơi. Xu trong game chỉ là điểm ảo, không quy
          đổi thành tiền thật.
        </p>
      </div>
      <Link
        href="/status"
        className="rounded-lg bg-gold-400 px-5 py-3 font-semibold text-felt-950 transition-colors hover:bg-gold-300"
      >
        Xem trạng thái hệ thống
      </Link>
    </main>
  );
}
