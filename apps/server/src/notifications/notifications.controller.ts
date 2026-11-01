import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { cursorPageQuerySchema, type NotificationPage } from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/** The caller's own notifications only. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(cursorPageQuerySchema))
    query: z.output<typeof cursorPageQuerySchema>,
  ): Promise<NotificationPage> {
    return this.notifications.list(user.id, query);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  readAll(@CurrentUser() user: SessionUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(
    @CurrentUser() user: SessionUser,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}
