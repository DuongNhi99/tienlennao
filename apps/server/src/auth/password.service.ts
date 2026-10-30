import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id (the library default) with the OWASP-recommended minimum: 19 MiB memory,
 * 2 iterations, 1 lane. Parameters are encoded in each hash, so they can be raised later
 * without invalidating existing passwords.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | null = null;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // A malformed stored hash must never authenticate.
      return false;
    }
  }

  /**
   * Spends the same time as a real verification. Used when the account does not exist, so
   * response timing does not reveal which emails are registered.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-1');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
