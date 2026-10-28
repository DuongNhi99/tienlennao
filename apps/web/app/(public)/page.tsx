import type { CardId } from '@tienlen/shared';
import { Coins, Download, Lock, Play, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import { PlayingCard } from '@/components/game/playing-card';
import { InstallAppBanner } from '@/components/pwa/install-app-banner';
import { ButtonLink } from '@/components/ui/button';

const HERO_CARDS: { card: CardId; rotate: number }[] = [
  { card: '3S', rotate: -18 },
  { card: '10C', rotate: -9 },
  { card: 'QD', rotate: 0 },
  { card: 'AS', rotate: 9 },
  { card: '2H', rotate: 18 },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Thời gian thực',
    body: 'Chơi cùng ba người khác với lượt đánh đồng bộ tức thì trên mọi thiết bị.',
  },
  {
    icon: Lock,
    title: 'Phòng riêng',
    body: 'Tạo phòng có mã và mật khẩu để chơi cùng bạn bè, hoặc vào phòng công khai.',
  },
  {
    icon: Coins,
    title: 'Xu ảo miễn phí',
    body: 'Nhận xu khi đăng ký và mỗi ngày. Xu chỉ dùng trong game, không quy đổi thành tiền.',
  },
  {
    icon: Download,
    title: 'Cài như ứng dụng',
    body: 'Thêm vào màn hình chính trên điện thoại hoặc máy tính, mở nhanh toàn màn hình.',
  },
];

const STEPS = [
  'Mỗi người nhận 13 lá. Thứ tự từ nhỏ đến lớn: 3, 4, 5 … K, A, 2; cùng số thì ♠ < ♣ < ♦ < ♥.',
  'Người giữ 3♠ đánh trước ở ván đầu.',
  'Người sau phải đánh cùng kiểu bài nhưng lớn hơn — hoặc bỏ lượt.',
  'Khi mọi người khác đều bỏ lượt, người đánh cuối thắng vòng và được đi đầu vòng mới.',
  'Ai đánh hết bài trước là người chiến thắng.',
];

const COMBOS = [
  ['Rác', 'một lá lẻ'],
  ['Đôi', 'hai lá cùng số'],
  ['Sám', 'ba lá cùng số'],
  ['Sảnh', 'từ 3 lá liên tiếp trở lên, không chứa 2'],
  ['Đôi thông', 'từ 3 đôi liên tiếp trở lên'],
  ['Tứ quý', 'bốn lá cùng số'],
];

export default function LandingPage() {
  return (
    <main id="main">
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20">
          <div className="flex flex-col gap-5 text-center md:text-left">
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Tiến Lên Miền Nam, <span className="text-gold-400">chơi ngay</span> trên mọi thiết bị
            </h1>
            <p className="text-lg text-white/80">
              Bàn chơi bốn người, phòng riêng với bạn bè và ghép trận nhanh — miễn phí, bằng xu ảo.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
              <ButtonLink href="/lobby" size="lg" icon={<Play aria-hidden className="size-5" />}>
                Chơi ngay
              </ButtonLink>
              <ButtonLink href="/register" size="lg" variant="secondary">
                Đăng ký miễn phí
              </ButtonLink>
            </div>
          </div>
          <div
            aria-hidden
            className="relative mx-auto flex h-56 w-full max-w-sm items-end justify-center sm:h-72"
            style={{ '--card-w': 'clamp(4.5rem, 20vw, 7rem)' } as CSSProperties}
          >
            {HERO_CARDS.map(({ card, rotate }, i) => (
              <div
                key={card}
                className="absolute bottom-0 origin-bottom"
                style={{ transform: `translateX(${(i - 2) * 38}%) rotate(${rotate}deg)` }}
              >
                <PlayingCard card={card} className="shadow-xl" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="gioi-thieu" aria-labelledby="features-heading" className="bg-felt-950/50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="features-heading" className="mb-8 text-center text-2xl font-bold sm:text-3xl">
            Vì sao chọn Tiến Lên Online?
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-felt-800/70 p-5">
                <Icon aria-hidden className="mb-3 size-7 text-gold-400" />
                <h3 className="mb-1 font-semibold">{title}</h3>
                <p className="text-sm text-white/75">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="cach-choi" aria-labelledby="howto-heading">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <h2 id="howto-heading" className="mb-6 text-2xl font-bold sm:text-3xl">
              Cách chơi cơ bản
            </h2>
            <ol className="flex flex-col gap-3">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-400 font-bold text-felt-950">
                    {i + 1}
                  </span>
                  <span className="pt-1 text-white/85">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold">Các kiểu bài</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-felt-800/70 p-5">
              {COMBOS.map(([name, description]) => (
                <div key={name} className="contents">
                  <dt className="font-semibold text-gold-300">{name}</dt>
                  <dd className="text-white/80">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-white/60">
              Luật chặt (heo, đôi thông, tứ quý) và các trường hợp đặc biệt được mô tả chi tiết
              trong bản đặc tả luật chơi.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
        <InstallAppBanner />
      </section>
    </main>
  );
}
