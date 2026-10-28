import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Điều khoản sử dụng' };

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <article className="flex flex-col gap-4 text-white/85 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white">
        <h1 className="text-3xl font-bold text-white">Điều khoản sử dụng</h1>
        <p className="text-sm text-white/60">
          Bản nháp — cần được bộ phận pháp lý rà soát trước khi phát hành.
        </p>
        <h2>1. Xu ảo</h2>
        <p>
          Xu trong Tiến Lên Online là điểm ảo dùng để tham gia ván đấu. Xu không có giá trị tiền tệ,
          không thể mua, bán, chuyển nhượng hay quy đổi thành tiền hoặc giải thưởng thật.
        </p>
        <h2>2. Tài khoản</h2>
        <p>
          Bạn chịu trách nhiệm bảo mật thông tin đăng nhập. Mỗi người chỉ nên sử dụng một tài khoản.
        </p>
        <h2>3. Chơi công bằng</h2>
        <p>
          Nghiêm cấm gian lận, thông đồng, sử dụng phần mềm can thiệp, hoặc lợi dụng lỗi hệ thống.
          Tài khoản vi phạm có thể bị tạm khóa sau khi được xem xét.
        </p>
        <h2>4. Ứng xử</h2>
        <p>Không gửi nội dung xúc phạm, quấy rối hoặc spam trong phòng chơi.</p>
      </article>
    </main>
  );
}
