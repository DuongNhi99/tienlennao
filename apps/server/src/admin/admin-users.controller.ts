import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import {
  type AdminUserStatusResponse,
  type UpdateUserStatusRequest,
  updateUserStatusRequestSchema,
} from '@tienlen/shared';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { AppException } from '../common/errors/app.exception';
import { clientInfo } from '../common/http/client-info';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

/** Admin user management. The rest of the admin area arrives in Phase 7. */
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suspends or reactivates an account. Suspension revokes every session immediately. The
   * change and its reason are written to the audit log in the same transaction.
   */
  @Patch(':userId/status')
  async updateStatus(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body(new ZodValidationPipe(updateUserStatusRequestSchema)) body: UpdateUserStatusRequest,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<AdminUserStatusResponse> {
    if (userId === actor.id) {
      // Prevents an admin from locking themselves out.
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!target || target.status === 'DELETED') {
        throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      const suspend = body.status === 'SUSPENDED';
      await tx.user.update({
        where: { id: userId },
        data: {
          status: body.status,
          suspendedAt: suspend ? new Date() : null,
          suspensionReason: suspend ? body.reason : null,
        },
      });
      const { count } = suspend
        ? await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id,
          action: suspend ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
          targetType: 'USER',
          targetId: userId,
          reason: body.reason,
          metadata: { previousStatus: target.status, revokedSessions: count },
          ipAddress: clientInfo(req).ipAddress,
        },
      });
      return { userId, status: body.status, revokedSessions: count };
    });
  }
}
