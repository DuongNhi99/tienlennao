import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME } from '@tienlen/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env';

/**
 * The session cookie: HttpOnly (no script access), SameSite=Lax (not sent on cross-site
 * POSTs), Secure in production. The token is never placed in a response body or in storage
 * that JavaScript can read.
 */
@Injectable()
export class SessionCookie {
  private readonly base: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.base = {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  read(req: Request): string | undefined {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
  }

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, token, { ...this.base, expires: expiresAt });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, this.base);
  }
}
