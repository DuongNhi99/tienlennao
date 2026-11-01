import { HttpStatus, Injectable } from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import { type NotificationPage, rewardDayKey } from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RewardsService } from '../wallet/rewards.service';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path to open, e.g. `/history/<matchId>`. */
  link?: string;
  /** Unique per user: creating the same notification twice keeps the first one. */
  dedupeKey: string;
}

/**
 * In-app notification center. Notifications are created inside the transaction that caused
 * them (so a rolled-back settlement leaves no result notification) and de-duplicated by key.
 * Callers notify connected clients after commit with `announce`.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Creates the notifications that do not exist yet. Returns the users who got a new one. */
  async create(
    db: Prisma.TransactionClient,
    notifications: readonly NewNotification[],
  ): Promise<string[]> {
    const created: string[] = [];
    for (const n of notifications) {
      const { count } = await db.notification.createMany({
        data: {
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.link ? { link: n.link } : undefined,
          dedupeKey: n.dedupeKey,
        },
        skipDuplicates: true,
      });
      if (count > 0) created.push(n.userId);
    }
    return created;
  }

  /** Creates outside any transaction and tells the users' open clients. */
  async send(notifications: readonly NewNotification[]): Promise<void> {
    this.announce(await this.create(this.prisma, notifications));
  }

  announce(userIds: readonly string[]): void {
    this.realtime.notificationCreated([...new Set(userIds)]);
  }

  /** Newest first, with the unread count. Adds today's daily-reward reminder if due. */
  async list(
    userId: string,
    { cursor, limit }: { cursor?: string; limit: number },
    now = new Date(),
  ): Promise<NotificationPage> {
    if (!cursor) await this.remindDailyReward(userId, now);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: (row.data as { link?: string } | null)?.link ?? null,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > limit ? items.at(-1)!.id : null,
      unreadCount,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    // Another user's notification looks exactly like a missing one.
    if (count === 0 && !(await this.prisma.notification.findFirst({ where: { id, userId } }))) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** One reminder per Vietnam day while the daily reward is unclaimed. */
  private async remindDailyReward(userId: string, now: Date): Promise<void> {
    const status = await this.rewards.dailyStatus(userId, now);
    if (!status.claimable) return;
    await this.create(this.prisma, [
      {
        userId,
        type: 'DAILY_REWARD',
        title: 'Phần thưởng hằng ngày',
        body: `Phần thưởng ngày ${status.streakDay} (${status.amount} xu) đã sẵn sàng.`,
        link: '/lobby',
        dedupeKey: `daily:${rewardDayKey(now)}`,
      },
    ]);
  }
}
