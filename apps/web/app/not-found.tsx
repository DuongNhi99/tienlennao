import { ButtonLink } from '@/components/ui/button';
import { LogoMark } from '@/components/ui/logo';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <LogoMark className="size-14" />
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="text-white/80">Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</p>
      <ButtonLink href="/" size="lg">
        Về trang chủ
      </ButtonLink>
    </main>
  );
}
