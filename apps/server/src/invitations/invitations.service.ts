import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type CreatedInvitation,
  type Invitation,
  type InvitationList,
  INVITATION_TTL_HOURS,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { generateToken, hashToken } from '../common/crypto/tokens';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JOINABLE_STATUSES, playerSelect, roomError, RoomsService } from '../rooms/rooms.service';

/** At most this many usable link invitations per room, so links cannot be farmed. */
const MAX_OPEN_LINKS = 10;
const LIST_LIMIT = 50;

const invitationInclude = {
  room: { include: { _count: { select: { players: true } } } },
  inviter: { select: playerSelect },
  invitee: { select: playerSelect },
} satisfies Prisma.RoomInvitationInclude;
type InvitationRecord = Prisma.RoomInvitationGetPayload<{ include: typeof invitationInclude }>;

const unavailable = () => new AppException('INVITATION_UNAVAILABLE', HttpStatus.CONFLICT);

/**
 * Room invitations (contract: `contracts/invitations.ts` in @tienlen/shared).
 *
 * - Any seated player of a room that has not started may invite.
 * - DIRECT: one per room and invitee while pending (asking again returns the same one). Only the
 *   invitee may accept or reject it, once. The invitee gets an in-app notification.
 * - LINK: a 256-bit token, shown once; only its SHA-256 hash is stored. Reusable until it expires
 *   or is cancelled; each use seats one player.
 * - Accepting seats the player through the normal seat rules (capacity, balance, one seat per
 *   user, removed players stay out) but skips the room password, in the same transaction that
 *   marks the invitation used.
 * - Invitations expire after INVITATION_TTL_HOURS and are cancelled when the room starts or
 *   closes (RoomsService.cancelInvitations).
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, roomId: string, inviteeId?: string): Promise<CreatedInvitation> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { players: { select: { userId: true } } },
    });
    if (!room || !JOINABLE_STATUSES.includes(room.status)) throw roomError.notFound();
    if (!room.players.some((p) => p.userId === userId)) throw roomError.forbidden();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000);

    if (inviteeId === undefined) {
      const open = await this.prisma.roomInvitation.count({
        where: { roomId, kind: 'LINK', status: 'PENDING', expiresAt: { gt: new Date() } },
      });
      if (open >= MAX_OPEN_LINKS)
        throw new AppException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
      const token = generateToken();
      const created = await this.prisma.roomInvitation.create({
        data: { roomId, inviterId: userId, kind: 'LINK', tokenHash: hashToken(token), expiresAt },
        include: invitationInclude,
      });
      return { ...this.toDto(created), link: `/invite/${token}` };
    }

    if (inviteeId === userId) {
      throw roomError.invalid('inviteeId', 'Bạn không thể tự mời mình.');
    }
    const invitee = await this.prisma.user.findUnique({
      where: { id: inviteeId },
      select: { status: true },
    });
    if (!invitee || invitee.status !== 'ACTIVE') {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (room.players.some((p) => p.userId === inviteeId)) throw roomError.alreadyInRoom();
    if (room.removedUserIds.includes(inviteeId)) throw roomError.forbidden();

    const existing = await this.prisma.roomInvitation.findFirst({
      where: {
        roomId,
        inviteeId,
        kind: 'DIRECT',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: invitationInclude,
    });
    if (existing) return { ...this.toDto(existing), link: null };

    const created = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.roomInvitation.create({
        data: { roomId, inviterId: userId, inviteeId, kind: 'DIRECT', expiresAt },
        include: invitationInclude,
      });
      const inviter = invitation.inviter.profile?.displayName ?? '';
      await this.notifications.create(tx, [
        {
          userId: inviteeId,
          type: 'ROOM_INVITATION',
          title: 'Lời mời vào bàn',
          body: `${inviter} mời bạn vào phòng ${room.name ?? room.code}.`,
          link: '/invitations',
          dedupeKey: `invitation:${invitation.id}`,
        },
      ]);
      return invitation;
    });
    this.notifications.announce([inviteeId]);
    return { ...this.toDto(created), link: null };
  }

  /** Invitations the user received, newest first. */
  async received(userId: string): Promise<InvitationList> {
    const rows = await this.prisma.roomInvitation.findMany({
      where: { inviteeId: userId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: invitationInclude,
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  /** A room's invitations, for the people seated in it. */
  async forRoom(userId: string, roomId: string): Promise<InvitationList> {
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (seat?.roomId !== roomId) throw roomError.forbidden();
    const rows = await this.prisma.roomInvitation.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      include: invitationInclude,
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async accept(userId: string, invitationId: string): Promise<{ roomId: string }> {
    const invitation = await this.findDirect(userId, invitationId);
    return this.rooms.joinInvited(userId, invitation.roomId, async (tx) => {
      // Claimed in the seating transaction: two concurrent accepts seat the player once.
      const { count } = await tx.roomInvitation.updateMany({
        where: { id: invitationId, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (count !== 1) throw unavailable();
    });
  }

  async reject(userId: string, invitationId: string): Promise<Invitation> {
    await this.findDirect(userId, invitationId);
    await this.respond(invitationId, 'REJECTED');
    return this.get(invitationId);
  }

  /** The inviter or the room's host withdraws an invitation (direct or link). */
  async cancel(userId: string, invitationId: string): Promise<Invitation> {
    const invitation = await this.prisma.roomInvitation.findUnique({
      where: { id: invitationId },
      include: { room: { select: { hostId: true } } },
    });
    if (!invitation) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    if (invitation.inviterId !== userId && invitation.room.hostId !== userId) {
      throw roomError.forbidden();
    }
    await this.respond(invitationId, 'CANCELLED');
    return this.get(invitationId);
  }

  /** What a link invitation leads to, for its landing page. */
  async preview(token: string): Promise<Invitation> {
    return this.toDto(await this.findLink(token));
  }

  async acceptLink(userId: string, token: string): Promise<{ roomId: string }> {
    const invitation = await this.findLink(token);
    if (this.statusOf(invitation) !== 'PENDING') throw unavailable();
    return this.rooms.joinInvited(userId, invitation.roomId, async (tx) => {
      const { count } = await tx.roomInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { useCount: { increment: 1 } },
      });
      if (count !== 1) throw unavailable();
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** A direct invitation addressed to `userId` that can still be answered. */
  private async findDirect(userId: string, invitationId: string) {
    const invitation = await this.prisma.roomInvitation.findUnique({ where: { id: invitationId } });
    // Someone else's invitation is reported as missing, not forbidden.
    if (!invitation || invitation.kind !== 'DIRECT' || invitation.inviteeId !== userId) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) throw unavailable();
    return invitation;
  }

  private async findLink(token: string): Promise<InvitationRecord> {
    const invitation = await this.prisma.roomInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: invitationInclude,
    });
    if (!invitation) throw new AppException('INVALID_TOKEN', HttpStatus.NOT_FOUND);
    return invitation;
  }

  private async respond(invitationId: string, status: 'REJECTED' | 'CANCELLED'): Promise<void> {
    const { count } = await this.prisma.roomInvitation.updateMany({
      where: { id: invitationId, status: 'PENDING' },
      data: { status, respondedAt: new Date() },
    });
    if (count !== 1) throw unavailable();
  }

  private async get(invitationId: string): Promise<Invitation> {
    return this.toDto(
      await this.prisma.roomInvitation.findUniqueOrThrow({
        where: { id: invitationId },
        include: invitationInclude,
      }),
    );
  }

  /** Pending invitations past their expiry read as EXPIRED before the sweep marks them. */
  private statusOf(invitation: { status: Invitation['status']; expiresAt: Date }) {
    return invitation.status === 'PENDING' && invitation.expiresAt <= new Date()
      ? 'EXPIRED'
      : invitation.status;
  }

  private toDto(invitation: InvitationRecord): Invitation {
    return {
      id: invitation.id,
      kind: invitation.kind,
      status: this.statusOf(invitation),
      room: {
        id: invitation.room.id,
        code: invitation.room.code,
        name: invitation.room.name,
        status: invitation.room.status,
        playerCount: invitation.room._count.players,
        maxPlayers: invitation.room.maxPlayers,
        entryFee: invitation.room.entryFee,
      },
      inviter: this.rooms.publicPlayer(invitation.inviter),
      invitee: invitation.invitee ? this.rooms.publicPlayer(invitation.invitee) : null,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
      useCount: invitation.useCount,
    };
  }
}
