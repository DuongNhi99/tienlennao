import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { generateToken, hashToken } from '../common/crypto/tokens';
import { PrismaService } from '../prisma/prisma.service';

export type EmailTokenKind = 'verify-email' | 'reset-password';

const TTL_MS: Record<EmailTokenKind, number> = {
  'verify-email': 24 * 60 * 60 * 1000,
  'reset-password': 30 * 60 * 1000,
};

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Short-lived, single-use tokens sent by email. Only hashes are stored. Issuing a new token
 * deletes the user's previous unused ones, so only the latest link works.
 */
@Injectable()
export class EmailTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(kind: EmailTokenKind, userId: string): Promise<string> {
    const token = generateToken();
    await this.prisma.$transaction(async (tx) => {
      const t = this.table(kind, tx);
      await t.deleteMany({ where: { userId, usedAt: null } });
      await t.create({
        data: {
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TTL_MS[kind]),
        },
      });
    });
    return token;
  }

  /**
   * Marks a valid token as used and returns its user. The conditional update makes this safe
   * under concurrency: of two simultaneous requests with the same token, only one succeeds.
   */
  async consume(kind: EmailTokenKind, token: string, db: Db = this.prisma): Promise<string | null> {
    const table = this.table(kind, db);
    const row = await table.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    const now = new Date();
    if (!row || row.usedAt || row.expiresAt <= now) return null;
    const { count } = await table.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1 ? row.userId : null;
  }

  /** Both token tables have identical columns, so one delegate type describes either. */
  private table(kind: EmailTokenKind, db: Db): Prisma.EmailVerificationTokenDelegate {
    return (
      kind === 'verify-email' ? db.emailVerificationToken : db.passwordResetToken
    ) as Prisma.EmailVerificationTokenDelegate;
  }
}
