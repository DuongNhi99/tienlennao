import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from '../errors/app.exception';

/**
 * Validates a request body/query/param against a shared Zod schema and returns the parsed
 * (and therefore trusted, normalized) value. Usage: `@Body(new ZodValidationPipe(schema))`.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
