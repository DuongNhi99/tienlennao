import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES_VI, type ErrorCode, type ErrorDetail } from '@tienlen/shared';

/** Domain error carrying a stable error code from the shared contract. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    readonly details?: ErrorDetail[],
    message: string = ERROR_MESSAGES_VI[code],
  ) {
    super(message, status);
  }
}
