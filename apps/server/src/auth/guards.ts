import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception';
import type { Env } from '../config/env';
import { type AuthenticatedRequest, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { SessionCookie } from './session-cookie';
import { SessionsService } from './sessions.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests, in addition to SameSite=Lax cookies:
 * state-changing requests from a browser must come from an allowed web origin. Requests
 * without browser headers (server-to-server, CLI tools) carry no ambient cookies to abuse.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = new Set(config.get('WEB_ORIGIN', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    if ((origin && !this.allowedOrigins.has(origin)) || fetchSite === 'cross-site') {
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}

/** Every route requires a valid session unless it is marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookie,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const token = this.cookie.read(req);
    if (!token) throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED);

    const session = await this.sessions.validate(token);
    if (!session || session.user.status === 'DELETED') {
      this.cookie.clear(res);
      throw new AppException('SESSION_EXPIRED', HttpStatus.UNAUTHORIZED);
    }
    if (session.user.status === 'SUSPENDED') {
      // Suspension revokes sessions too; this also catches sessions created before it.
      await this.sessions.revokeAllForUser(session.user.id);
      this.cookie.clear(res);
      throw new AppException('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN);
    }
    if (session.extended) this.cookie.set(res, token, session.expiresAt);

    req.auth = session;
    return true;
  }
}

/** Enforces @Roles(...) on the server; hiding UI is never the only protection. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    if (!req.auth || !roles.includes(req.auth.user.role)) {
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
