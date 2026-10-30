import { stat } from 'node:fs/promises';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  type CurrentUserSummary,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
  type UserStats,
} from '@tienlen/shared';
import type { Response } from 'express';
import { CurrentUser, Public } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { AppException } from '../common/errors/app.exception';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AvatarStorageService } from './avatar-storage.service';
import { UsersService } from './users.service';

const ACCEPTED_MIME_TYPES: ReadonlySet<string> = new Set(AVATAR_MIME_TYPES);

/** The fields of multer's in-memory file that this controller reads. */
interface UploadedImage {
  mimetype: string;
  buffer: Buffer;
}

@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: SessionUser): Promise<CurrentUserSummary> {
    return this.users.getSummary(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<CurrentUserSummary> {
    return this.users.updateDisplayName(user.id, body.displayName);
  }

  @Get('stats')
  stats(@CurrentUser() user: SessionUser): Promise<UserStats> {
    return this.users.getStats(user.id);
  }

  /** multipart/form-data with one `avatar` file: PNG, JPEG or WebP, at most 2 MB. */
  @Put('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      // No storage option: multer keeps the upload in memory (never written to disk as-is).
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<CurrentUserSummary> {
    // The declared type is only a first filter; AvatarStorageService checks the real content.
    if (!file || !ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
        { path: 'avatar', message: 'Ảnh đại diện phải là ảnh PNG, JPEG hoặc WebP.' },
      ]);
    }
    return this.users.setAvatar(user.id, file.buffer);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser() user: SessionUser): Promise<CurrentUserSummary> {
    return this.users.removeAvatar(user.id);
  }
}

/** Uploaded avatars are public images with random, immutable names. */
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly storage: AvatarStorageService) {}

  @Public()
  @Get(':file')
  async get(@Param('file') name: string, @Res() res: Response): Promise<void> {
    const file = this.storage.resolve(name);
    if (!file || !(await stat(file).catch(() => null))?.isFile()) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    res.sendFile(file, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // The web app runs on another origin; helmet's default (same-origin) would block it.
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  }
}
