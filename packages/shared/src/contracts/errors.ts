import { z } from 'zod';

/**
 * Canonical error codes returned by REST responses and WebSocket acknowledgements.
 * Clients must branch on `code`, never on the human-readable message.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_EXISTS',
  'SESSION_EXPIRED',
  'ACCOUNT_SUSPENDED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'INSUFFICIENT_COINS',
  'NOT_YOUR_TURN',
  'INVALID_CARD_SELECTION',
  'INVALID_COMBINATION',
  'ACTION_ALREADY_PROCESSED',
  'MATCH_FINISHED',
  'CONNECTION_LOST',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Vietnamese user-facing messages. Must never contain internal details. */
export const ERROR_MESSAGES_VI: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  UNAUTHENTICATED: 'Bạn cần đăng nhập để tiếp tục.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy nội dung yêu cầu.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_ALREADY_EXISTS: 'Email này đã được sử dụng.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ACCOUNT_SUSPENDED: 'Tài khoản của bạn đang bị tạm khóa.',
  ROOM_NOT_FOUND: 'Không tìm thấy phòng.',
  ROOM_FULL: 'Phòng đã đủ người.',
  ROOM_ALREADY_STARTED: 'Phòng đã bắt đầu ván đấu.',
  INSUFFICIENT_COINS: 'Bạn không đủ xu để tham gia.',
  NOT_YOUR_TURN: 'Chưa đến lượt của bạn.',
  INVALID_CARD_SELECTION: 'Lựa chọn bài không hợp lệ.',
  INVALID_COMBINATION: 'Bộ bài không hợp lệ hoặc không chặn được bài trên bàn.',
  ACTION_ALREADY_PROCESSED: 'Thao tác này đã được xử lý.',
  MATCH_FINISHED: 'Ván đấu đã kết thúc.',
  CONNECTION_LOST: 'Mất kết nối tới máy chủ. Đang thử kết nối lại…',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  SERVICE_UNAVAILABLE: 'Máy chủ tạm thời không khả dụng. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Đã xảy ra lỗi. Vui lòng thử lại sau.',
};

export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** Envelope for every non-2xx REST response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.array(errorDetailSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
