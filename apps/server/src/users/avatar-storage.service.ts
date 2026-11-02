import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';

const AVATAR_SIZE = 256;
/** Rejects decompression bombs before decoding the full image. */
const MAX_INPUT_PIXELS = 4096 * 4096;
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp']);
/** Strict UUID shape: anything else would make the uuid column lookup throw. */
const STORED_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

const invalidImage = () =>
  new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
    { path: 'avatar', message: 'Ảnh đại diện phải là ảnh PNG, JPEG hoặc WebP hợp lệ.' },
  ]);

/**
 * Stores avatars in the database (`avatar_images`), so they survive redeploys on hosts without
 * persistent disks. Every upload is decoded and re-encoded as a 256×256 WebP, so only pixels
 * survive: metadata, embedded scripts or polyglot payloads are discarded, and the stored name is
 * random (never derived from user input).
 */
@Injectable()
export class AvatarStorageService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validates the actual file content (not the declared type) and returns the WebP bytes. */
  async encode(input: Buffer): Promise<Buffer> {
    try {
      const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const { format } = await image.metadata();
      if (!format || !ACCEPTED_FORMATS.has(format)) throw invalidImage();
      return await image
        .rotate() // apply EXIF orientation before the metadata is dropped
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw invalidImage();
    }
  }

  /** Stores encoded bytes for a user and returns the stored name. */
  async save(tx: Prisma.TransactionClient, userId: string, webp: Buffer): Promise<string> {
    const id = randomUUID();
    await tx.avatarImage.create({ data: { id, userId, data: new Uint8Array(webp) } });
    return `${id}.webp`;
  }

  async remove(tx: Prisma.TransactionClient, name: string): Promise<void> {
    const id = this.idOf(name);
    if (id) await tx.avatarImage.deleteMany({ where: { id } });
  }

  /** The WebP bytes for a stored name, or null if there is no such avatar. */
  async load(name: string): Promise<Buffer | null> {
    const id = this.idOf(name);
    if (!id) return null;
    const image = await this.prisma.avatarImage.findUnique({
      where: { id },
      select: { data: true },
    });
    return image ? Buffer.from(image.data) : null;
  }

  /** The image id for a stored name, or null if the name is not one we generate. */
  private idOf(name: string): string | null {
    return STORED_NAME.exec(name)?.[1] ?? null;
  }
}
