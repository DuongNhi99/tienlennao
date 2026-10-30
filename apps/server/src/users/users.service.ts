import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
      avatarUrl: this.avatarUrl(user.profile?.avatarUrl ?? null),
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
    const name = await this.avatars.save(image);
    const previous = await this.replaceAvatar(userId, name);
    if (previous) await this.avatars.remove(previous);
    return this.getSummary(userId);
  }

  async removeAvatar(userId: string): Promise<CurrentUserSummary> {
    const previous = await this.replaceAvatar(userId, null);
    if (previous) await this.avatars.remove(previous);
    return this.getSummary(userId);
  }

  /** Stores the new value and returns the previous uploaded file name, if any. */
  private async replaceAvatar(userId: string, value: string | null): Promise<string | null> {
    const { avatarUrl } = await this.prisma.userProfile.findUniqueOrThrow({
      where: { userId },
      select: { avatarUrl: true },
    });
    await this.prisma.userProfile.update({ where: { userId }, data: { avatarUrl: value } });
    return avatarUrl && !/^https?:\/\//.test(avatarUrl) ? avatarUrl : null;
  }

  /**
   * `avatarUrl` holds either an absolute URL (e.g. from an OAuth provider) or the name of an
   * uploaded file, which is served by GET /avatars/:file.
   */
  private avatarUrl(stored: string | null): string | null {
    if (!stored) return null;
    return /^https?:\/\//.test(stored) ? stored : `${this.avatarBaseUrl}/${stored}`;
  }
}
