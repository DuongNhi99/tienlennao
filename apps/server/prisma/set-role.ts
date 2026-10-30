/* eslint-disable no-console -- CLI script */
import { PrismaClient } from '@prisma/client';

// Grants or removes the ADMIN role for an existing account. There is deliberately no API for
// this: the first admin must be created by someone with database access.
//   pnpm db:set-role <email> ADMIN|PLAYER
const [emailArg, roleArg] = process.argv.slice(2);
const role = roleArg?.toUpperCase();

if (!emailArg || (role !== 'ADMIN' && role !== 'PLAYER')) {
  console.error('Usage: pnpm db:set-role <email> ADMIN|PLAYER');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(email: string, newRole: 'ADMIN' | 'PLAYER'): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!user) {
    console.error(`No account with email ${email}.`);
    process.exitCode = 1;
    return;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role: newRole } }),
    prisma.adminAuditLog.create({
      data: {
        actorId: null,
        action: 'USER_ROLE_CHANGED',
        targetType: 'USER',
        targetId: user.id,
        reason: 'Changed with the db:set-role command',
        metadata: { from: user.role, to: newRole },
      },
    }),
  ]);
  console.log(`${email}: ${user.role} → ${newRole}`);
}

main(emailArg.trim().toLowerCase(), role)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
