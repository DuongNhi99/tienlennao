import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  API_PREFIX,
  type CurrentUserSummary,
  type UserStats,
  winRatePercent,
} from '@tienlen/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorageService } from './avatar-storage.service';

@Injectable()
export class UsersService {
  private readonly avatarBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarStorageService,
    config: ConfigService<Env, true>,
  ) {
    const apiUrl =
      config.get('API_PUBLIC_URL', { infer: true }) ??
      `http://localhost:${config.get('PORT', { infer: true })}/${API_PREFIX}`;
    this.avatarBaseUrl = `${apiUrl}/avatars`;
  }

  async getSummary(userId: string): Promise<CurrentUserSummary> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        profile: {
          select: { displayName: true, avatarUrl: true, matchesPlayed: true, matchesWon: true },
        },
        wallet: { select: { balance: true } },
      },
    });
    return {
      id: user.id,
      displayName: user.profile?.displayName ?? '',
      avatarUrl: this.publicAvatarUrl(user.profile?.avatarUrl ?? null),
      createdAt: user.createdAt.toISOString(),
      balance: user.wallet?.balance ?? 0,
      matchesPlayed: user.profile?.matchesPlayed ?? 0,
      matchesWon: user.profile?.matchesWon ?? 0,
    };
  }

  async getStats(userId: string): Promise<UserStats> {
    const profile = await this.prisma.userProfile.findUniqueOrThrow({
      where: { userId },
      select: { matchesPlayed: true, matchesWon: true },
    });
    const { matchesPlayed, matchesWon } = profile;
    return {
      matchesPlayed,
      matchesWon,
      matchesLost: Math.max(0, matchesPlayed - matchesWon),
      winRate: winRatePercent(matchesPlayed, matchesWon),
    };
  }

  async updateDisplayName(userId: string, displayName: string): Promise<CurrentUserSummary> {
    await this.prisma.userProfile.update({ where: { userId }, data: { displayName } });
    return this.getSummary(userId);
  }

  async setAvatar(userId: string, image: Buffer): Promise<CurrentUserSummary> {
    const webp = await this.avatars.encode(image);
    await this.replaceAvatar(userId, (tx) => this.avatars.save(tx, userId, webp));
    return this.getSummary(userId);
  }

  async removeAvatar(userId: string): Promise<CurrentUserSummary> {
    await this.replaceAvatar(userId, () => Promise.resolve(null));
    return this.getSummary(userId);
  }

  /** Stores the new value and deletes the previously uploaded image, in one transaction. */
  private async replaceAvatar(
    userId: string,
    next: (tx: Prisma.TransactionClient) => Promise<string | null>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { avatarUrl } = await tx.userProfile.findUniqueOrThrow({
        where: { userId },
        select: { avatarUrl: true },
      });
      const value = await next(tx);
      await tx.userProfile.update({ where: { userId }, data: { avatarUrl: value } });
      if (avatarUrl && !/^https?:\/\//.test(avatarUrl)) await this.avatars.remove(tx, avatarUrl);
    });
  }

  /**
   * `avatarUrl` holds either an absolute URL (e.g. from an OAuth provider) or the name of an
   * uploaded image, which is served by GET /avatars/:file.
   */
  publicAvatarUrl(stored: string | null): string | null {
    if (!stored) return null;
    return /^https?:\/\//.test(stored) ? stored : `${this.avatarBaseUrl}/${stored}`;
  }
}
