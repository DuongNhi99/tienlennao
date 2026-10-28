import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Chính sách quyền riêng tư' };

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <article className="flex flex-col gap-4 text-white/85 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white">
        <h1 className="text-3xl font-bold text-white">Chính sách quyền riêng tư</h1>
        <p className="text-sm text-white/60">
          Bản nháp — cần được bộ phận pháp lý rà soát trước khi phát hành.
        </p>
        <h2>Dữ liệu chúng tôi lưu</h2>
        <p>
          Email, tên hiển thị, ảnh đại diện (nếu có), lịch sử ván đấu và giao dịch xu ảo. Mật khẩu
          chỉ được lưu dưới dạng băm một chiều.
        </p>
        <h2>Dữ liệu người chơi khác thấy được</h2>
        <p>
          Chỉ tên hiển thị, ảnh đại diện và thành tích. Email và thông tin đăng nhập không bao giờ
          được hiển thị cho người chơi khác.
        </p>
        <h2>Cookie</h2>
        <p>
          Chúng tôi dùng cookie phiên bảo mật (HttpOnly) để giữ trạng thái đăng nhập, không dùng
          cookie quảng cáo.
        </p>
      </article>
    </main>
  );
}
