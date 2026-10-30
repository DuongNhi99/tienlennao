import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminUsersController } from '../admin/admin-users.controller';
import { MailService } from '../mail/mail.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { AvatarStorageService } from '../users/avatar-storage.service';
import { AvatarsController, UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailTokensService } from './email-tokens.service';
import { AuthGuard, OriginGuard, RolesGuard } from './guards';
import { PasswordService } from './password.service';
import { SessionCookie } from './session-cookie';
import { SessionsService } from './sessions.service';

/**
 * Accounts: authentication, sessions, profile, and admin account status. The guards are
 * global and run in order: Origin (CSRF) → Auth (session) → Roles.
 */
@Module({
  controllers: [AuthController, UsersController, AvatarsController, AdminUsersController],
  providers: [
    AuthService,
    PasswordService,
    SessionsService,
    SessionCookie,
    EmailTokensService,
    RateLimitService,
    MailService,
    WalletService,
    UsersService,
    AvatarStorageService,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}
