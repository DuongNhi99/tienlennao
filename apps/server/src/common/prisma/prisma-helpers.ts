import { Prisma } from '@prisma/client';

/** True for a unique-constraint violation, optionally on a specific column. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (!field) return true;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}

/**
 * Row locks (SELECT … FOR UPDATE) serialize concurrent commands on one room or match inside an
 * interactive transaction, across every API instance.
 */
export async function lockRoom(tx: Prisma.TransactionClient, roomId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT 1 FROM rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
  return rows.length > 0;
}

export async function lockMatch(tx: Prisma.TransactionClient, matchId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT 1 FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
  return rows.length > 0;
}
