import type { InvitationStatus } from '@tienlen/shared';

export const INVITATION_STATUS_LABELS: Readonly<Record<InvitationStatus, string>> = {
  PENDING: 'Đang chờ',
  ACCEPTED: 'Đã nhận',
  REJECTED: 'Đã từ chối',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
};
