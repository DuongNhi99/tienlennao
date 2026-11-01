import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  type AuthResponse,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type MessageResponse,
  type RegisterRequest,
  registerRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
} from '@tienlen/shared';
import type { Request, Response } from 'express';
import { clientInfo } from '../common/http/client-info';
import { NotificationsService } from '../notifications/notifications.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService, toAuthUser } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { SessionCookie } from './session-cookie';
import { type SessionUser, SessionsService } from './sessions.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookie,
    private readonly notifications: NotificationsService,
  ) {}

  /** 201: account created and signed in. 409 EMAIL_ALREADY_EXISTS. */
  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, session } = await this.auth.register(body, clientInfo(req));
    await this.replaceSession(req, res, session);
    return { user };
  }

  /** 200: signed in. 401 INVALID_CREDENTIALS (generic), 403 ACCOUNT_SUSPENDED, 429. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, session } = await this.auth.login(body, clientInfo(req));
    await this.replaceSession(req, res, session);
    return { user };
  }

  /** 204, also without a valid session, so a stale cookie can always be cleared. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = this.cookie.read(req);
    if (token) await this.sessions.revoke(token);
    this.cookie.clear(res);
  }

  /** 204: revokes every session of the current user, on every device. */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(user.id);
    this.cookie.clear(res);
    await this.notifications.send([
      {
        userId: user.id,
        type: 'SECURITY',
        title: 'Đã đăng xuất mọi thiết bị',
        body: 'Mọi phiên đăng nhập của bạn vừa được kết thúc theo yêu cầu.',
        dedupeKey: `logout-all:${new Date().toISOString()}`,
      },
    ]);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): AuthResponse {
    return { user: toAuthUser(user) };
  }

  /** 202 with the same message whether or not the email is registered. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: Request,
  ): Promise<MessageResponse> {
    await this.auth.forgotPassword(body.email, clientInfo(req));
    return {
      message:
        'Nếu email này đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu trong vài phút.',
    };
  }

  /** 200: password changed and every session revoked. 400 INVALID_TOKEN. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponse> {
    await this.auth.resetPassword(body, clientInfo(req));
    this.cookie.clear(res);
    return { message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập bằng mật khẩu mới.' };
  }

  /** Public: the link may be opened on a device that is not signed in. 400 INVALID_TOKEN. */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: Request,
  ): Promise<MessageResponse> {
    await this.auth.verifyEmail(body.token, clientInfo(req));
    return { message: 'Email của bạn đã được xác minh.' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@CurrentUser() user: SessionUser): Promise<MessageResponse> {
    const sent = await this.auth.resendVerification(user);
    return {
      message: sent
        ? 'Đã gửi lại email xác minh. Vui lòng kiểm tra hộp thư.'
        : 'Email của bạn đã được xác minh.',
    };
  }

  /** A new sign-in always gets a fresh token; any session this browser had is revoked. */
  private async replaceSession(
    req: Request,
    res: Response,
    session: { token: string; expiresAt: Date },
  ): Promise<void> {
    const previous = this.cookie.read(req);
    if (previous) await this.sessions.revoke(previous);
    this.cookie.set(res, session.token, session.expiresAt);
  }
}
