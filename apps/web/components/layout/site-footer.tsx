import Link from 'next/link';

const LINKS = [
  { href: '/terms', label: 'Điều khoản sử dụng' },
  { href: '/privacy', label: 'Quyền riêng tư' },
  { href: '/status', label: 'Trạng thái hệ thống' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-felt-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-white/70 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>
          © 2026 Tiến Lên Online. Xu trong game là điểm ảo, không có giá trị quy đổi thành tiền
          thật.
        </p>
        <nav aria-label="Liên kết chân trang">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center hover:text-white hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
