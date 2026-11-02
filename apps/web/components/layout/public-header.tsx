import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-felt-900/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Logo />
        <nav aria-label="Tài khoản" className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="md" className="whitespace-nowrap">
            Đăng nhập
          </ButtonLink>
          {/* A variant, not `hidden`: `cn` does not merge, so `hidden` loses to the base `inline-flex`. */}
          <ButtonLink href="/register" size="md" className="whitespace-nowrap max-[399px]:hidden">
            Đăng ký
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
