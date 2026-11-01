import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import type { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { type RateLimitRule, RateLimitService } from '../rate-limit/rate-limit.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailTokensService } from './email-tokens.service';
import { PasswordService } from './password.service';
import { type SessionUser, SessionsService } from './sessions.service';

export const AUTH_RATE_LIMITS = {
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 10, windowSeconds: 60 * 60 },
  forgotPerIp: { limit: 10, windowSeconds: 60 * 60 },
  /** Exceeding this is silent, so the response never reveals whether the account exists. */
  forgotPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  tokenPerIp: { limit: 30, windowSeconds: 60 * 60 },
  resendVerificationPerUser: { limit: 3, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  profile: { select: { displayName: true } },
} satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toSessionUser({ profile, ...user }: SelectedUser): SessionUser {
  return { ...user, displayName: profile?.displayName ?? '' };
}

export function toAuthUser(user: SessionUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly webUrl: string;
  private readonly initialBonus: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly tokens: EmailTokensService,
    private readonly rateLimit: RateLimitService,
    private readonly mail: MailService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl =
      config.get('WEB_APP_URL', { infer: true }) ?? config.get('WEB_ORIGIN', { infer: true })[0]!;
    this.initialBonus = config.get('INITIAL_COIN_BONUS', { infer: true });
  }

  async register(input: RegisterRequest, client: ClientInfo) {
    await this.rateLimit.enforce(`register:ip:${client.ipAddress}`, AUTH_RATE_LIMITS.registerPerIp);
    const passwordHash = await this.passwords.hash(input.password);

    let created: SelectedUser;
    try {
      // User, profile and wallet are created together or not at all.
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            profile: { create: { displayName: input.displayName } },
          },
          select: USER_SELECT,
        });
        await this.wallet.openWithInitialBonus(tx, user.id, this.initialBonus);
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException('EMAIL_ALREADY_EXISTS', HttpStatus.CONFLICT, [
          { path: 'email', message: 'Email này đã được sử dụng.' },
        ]);
      }
      throw error;
    }

    const user = toSessionUser(created);
    this.inBackground(this.sendVerificationEmail(user), 'verification email');
    const session = await this.sessions.create(user.id, client);
    return { user: toAuthUser(user), session };
  }

  async login(input: LoginRequest, client: ClientInfo) {
    await this.rateLimit.enforce(`login:ip:${client.ipAddress}`, AUTH_RATE_LIMITS.loginPerIp);
    await this.rateLimit.enforce(`login:email:${input.email}`, AUTH_RATE_LIMITS.loginPerEmail);

    const found = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...USER_SELECT, passwordHash: true },
    });
    const valid = found?.passwordHash
      ? await this.passwords.verify(found.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);
    // One generic error for an unknown email, a wrong password, or a deleted account.
    if (!found || !valid || found.status === 'DELETED') {
      throw new AppException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }
    if (found.status === 'SUSPENDED') {
      throw new AppException('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN);
    }

    const { passwordHash: _hash, ...selected } = found;
    const user = toSessionUser(selected);
    const session = await this.sessions.create(user.id, client);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: toAuthUser(user), session };
  }

  /** Always resolves the same way, whether or not the email belongs to an account. */
  async forgotPassword(email: string, client: ClientInfo): Promise<void> {
    await this.rateLimit.enforce(`forgot:ip:${client.ipAddress}`, AUTH_RATE_LIMITS.forgotPerIp);
    const perEmail = await this.rateLimit.consume(
      `forgot:email:${email}`,
      AUTH_RATE_LIMITS.forgotPerEmail,
    );
    if (!perEmail.allowed) return;
    // Not awaited, so the response time does not depend on whether the account exists.
    this.inBackground(this.sendPasswordResetEmail(email), 'password reset email');
  }

  async resetPassword(input: ResetPasswordRequest, client: ClientInfo): Promise<void> {
    await this.rateLimit.enforce(`token:ip:${client.ipAddress}`, AUTH_RATE_LIMITS.tokenPerIp);
    const passwordHash = await this.passwords.hash(input.password);
    const now = new Date();

    const userId = await this.prisma.$transaction(async (tx) => {
      const id = await this.tokens.consume('reset-password', input.token, tx);
      if (!id) return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { emailVerifiedAt: true },
      });
      await tx.user.update({
        where: { id },
        // Receiving the email proves the address, so it also counts as verification.
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
      // Signs out every device, including one an attacker may control.
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.notifications.create(tx, [
        {
          userId: id,
          type: 'SECURITY',
          title: 'Mật khẩu đã được đặt lại',
          body: 'Mật khẩu của bạn vừa được đổi và mọi thiết bị đã bị đăng xuất. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.',
          dedupeKey: `password-reset:${now.toISOString()}`,
        },
      ]);
      return id;
    });
    if (!userId) throw new AppException('INVALID_TOKEN', HttpStatus.BAD_REQUEST);
  }

  async verifyEmail(token: string, client: ClientInfo): Promise<void> {
    await this.rateLimit.enforce(`token:ip:${client.ipAddress}`, AUTH_RATE_LIMITS.tokenPerIp);
    const userId = await this.tokens.consume('verify-email', token);
    if (!userId) throw new AppException('INVALID_TOKEN', HttpStatus.BAD_REQUEST);
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /** Returns false when the address is already verified (nothing is sent). */
  async resendVerification(user: SessionUser): Promise<boolean> {
    if (user.emailVerifiedAt) return false;
    await this.rateLimit.enforce(
      `verify-resend:user:${user.id}`,
      AUTH_RATE_LIMITS.resendVerificationPerUser,
    );
    await this.sendVerificationEmail(user);
    return true;
  }

  private async sendVerificationEmail(user: SessionUser): Promise<void> {
    const token = await this.tokens.issue('verify-email', user.id);
    const url = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.mail.send(verificationEmail(user.email, user.displayName, url));
  }

  private async sendPasswordResetEmail(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: USER_SELECT });
    if (!user || user.status !== 'ACTIVE') return;
    const token = await this.tokens.issue('reset-password', user.id);
    const url = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send(passwordResetEmail(email, user.profile?.displayName ?? '', url));
  }

  private inBackground(task: Promise<void>, label: string): void {
    task.catch((error: unknown) =>
      this.logger.error(`Failed to send ${label}: ${describeError(error)}`),
    );
  }
}
