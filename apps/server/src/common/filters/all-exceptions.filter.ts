import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiError, ERROR_MESSAGES_VI, type ErrorCode } from '@tienlen/shared';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'VALIDATION_ERROR',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/**
 * Converts every HTTP error into the shared `ApiError` envelope. Framework messages and
 * stack traces are never sent to clients; unexpected errors are logged with the request ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const { status, body } = toApiError(exception, requestId);
    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId, method: request.method, path: request.path },
        'Unhandled error',
      );
    }
    response.status(status).json(body);
  }
}

export function toApiError(
  exception: unknown,
  requestId?: string,
): { status: number; body: ApiError } {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
          ...(exception.details ? { details: exception.details } : {}),
        },
      },
    };
  }

  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const code: ErrorCode =
    STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
  return {
    status,
    body: { error: { code, message: ERROR_MESSAGES_VI[code], requestId } },
  };
}
