import type { MailMessage } from './mail.service';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, paragraphs: string[], action: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return `<!doctype html><html lang="vi"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1d1d1f">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}
<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 16px;background:#f2c450;color:#04261a;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#555">Nếu nút không hoạt động, hãy mở liên kết: ${escapeHtml(action.url)}</p>
<p style="font-size:13px;color:#555">Tiến Lên Online — trò chơi giải trí, xu ảo không có giá trị quy đổi thành tiền.</p>
</body></html>`;
}

export function verificationEmail(to: string, displayName: string, url: string): MailMessage {
  const lines = [
    `Chào ${displayName},`,
    'Vui lòng xác minh địa chỉ email của bạn để bảo vệ tài khoản. Liên kết có hiệu lực trong 24 giờ.',
  ];
  return {
    to,
    subject: 'Xác minh email — Tiến Lên Online',
    text: [...lines, '', url].join('\n'),
    html: layout('Xác minh email', lines, { label: 'Xác minh email', url }),
  };
}

export function passwordResetEmail(to: string, displayName: string, url: string): MailMessage {
  const lines = [
    `Chào ${displayName},`,
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần.',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn không thay đổi.',
  ];
  return {
    to,
    subject: 'Đặt lại mật khẩu — Tiến Lên Online',
    text: [...lines, '', url].join('\n'),
    html: layout('Đặt lại mật khẩu', lines, { label: 'Đặt lại mật khẩu', url }),
  };
}
