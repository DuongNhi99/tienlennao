import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception';
import type { Env } from '../config/env';

const AVATAR_SIZE = 256;
/** Rejects decompression bombs before decoding the full image. */
const MAX_INPUT_PIXELS = 4096 * 4096;
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp']);
const STORED_NAME = /^[0-9a-f-]{36}\.webp$/;

const invalidImage = () =>
  new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
    { path: 'avatar', message: 'Ảnh đại diện phải là ảnh PNG, JPEG hoặc WebP hợp lệ.' },
  ]);

/**
 * Stores avatars on local disk. Every upload is decoded and re-encoded as a 256×256 WebP, so
 * only pixels survive: metadata, embedded scripts or polyglot payloads are discarded, and the
 * stored name is random (never derived from user input).
 */
@Injectable()
export class AvatarStorageService {
  private readonly dir: string;

  constructor(config: ConfigService<Env, true>) {
    this.dir = path.resolve(config.get('UPLOAD_DIR', { infer: true }), 'avatars');
  }

  /** Validates the actual file content (not the declared type) and returns the stored name. */
  async save(input: Buffer): Promise<string> {
    let output: Buffer;
    try {
      const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const { format } = await image.metadata();
      if (!format || !ACCEPTED_FORMATS.has(format)) throw invalidImage();
      output = await image
        .rotate() // apply EXIF orientation before the metadata is dropped
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw invalidImage();
    }
    const name = `${randomUUID()}.webp`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, name), output);
    return name;
  }

  async remove(name: string): Promise<void> {
    const file = this.resolve(name);
    if (file) await unlink(file).catch(() => undefined);
  }

  /** Absolute path for a stored name, or null if the name is not one we generate. */
  resolve(name: string): string | null {
    return STORED_NAME.test(name) ? path.join(this.dir, name) : null;
  }
}
