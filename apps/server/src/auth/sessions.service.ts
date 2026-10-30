import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole, UserStatus } from '@prisma/client';
import { generateToken, hashToken } from '../common/crypto/tokens';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sliding expiry is extended at most this often, to avoid a database write per request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
/** Absolute lifetime, as a multiple of the idle TTL, after which the user must sign in again. */
const ABSOLUTE_LIFETIME_FACTOR = 3;

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  displayName: string;
}

export interface ActiveSession {
  id: string;
  expiresAt: Date;
  /** True when this request extended the expiry; the cookie must then be re-issued. */
  extended: boolean;
  user: SessionUser;
}

/**
 * Server-managed sessions. The browser holds an opaque random token in an HttpOnly cookie;
 * the database holds only its SHA-256 hash. Revocation is immediate (logout, password reset,
 * suspension) because every request is checked against the `sessions` table.
 */
@Injectable()
export class SessionsService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SESSION_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  async create(
    userId: string,
    client: { ipAddress: string | null; userAgent: string | null },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, ...client },
    });
    return { token, expiresAt };
  }

  /** Returns the active session for a cookie token, extending its sliding expiry. */
  async validate(token: string): Promise<ActiveSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;

    let expiresAt = session.expiresAt;
    const extended = now - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
    if (extended) {
      const absoluteEnd = session.createdAt.getTime() + this.ttlMs * ABSOLUTE_LIFETIME_FACTOR;
      expiresAt = new Date(Math.min(now + this.ttlMs, absoluteEnd));
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt },
      });
    }

    const { profile, ...user } = session.user;
    return {
      id: session.id,
      expiresAt,
      extended,
      user: { ...user, displayName: profile?.displayName ?? '' },
    };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session of a user (logout everywhere, password reset, suspension). */
  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
