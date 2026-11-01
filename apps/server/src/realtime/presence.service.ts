import { Injectable } from '@nestjs/common';

/**
 * Which users have at least one open socket. In-process: with several API instances this
 * needs a shared store (see README, "Scaling").
 */
@Injectable()
export class PresenceService {
  private readonly connections = new Map<string, number>();

  /** Returns true when this is the user's first open connection. */
  connect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) + 1;
    this.connections.set(userId, count);
    return count === 1;
  }

  /** Returns true when the user has no open connection left. */
  disconnect(userId: string): boolean {
    const count = (this.connections.get(userId) ?? 0) - 1;
    if (count > 0) {
      this.connections.set(userId, count);
      return false;
    }
    this.connections.delete(userId);
    return true;
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }
}
