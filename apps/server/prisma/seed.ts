/* eslint-disable no-console -- CLI script */
import { PrismaClient } from '@prisma/client';

// Local-development seed. Idempotent: safe to run repeatedly.
// Seeds reference/configuration data only — no users, balances, or fake matches.
const prisma = new PrismaClient();

const DEFAULT_RULES_V1 = {
  variant: 'TIEN_LEN_MIEN_NAM',
  players: 4,
  cardsPerPlayer: 13,
  rankOrder: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
  // Lowest to highest: Spades ♠ < Clubs ♣ < Diamonds ♦ < Hearts ♥.
  suitOrder: ['S', 'C', 'D', 'H'],
  // The full rule specification (special combinations, penalties) is finalized in Phase 4.
  specVersion: 'draft-1',
};

const ACHIEVEMENTS = [
  {
    code: 'FIRST_MATCH',
    name: 'Ván đầu tiên',
    description: 'Hoàn thành ván đấu đầu tiên.',
    rewardAmount: 200,
  },
  {
    code: 'FIRST_WIN',
    name: 'Chiến thắng đầu tiên',
    description: 'Về nhất trong một ván đấu.',
    rewardAmount: 500,
  },
  {
    code: 'TEN_MATCHES',
    name: 'Người chơi chăm chỉ',
    description: 'Hoàn thành 10 ván đấu.',
    rewardAmount: 1000,
  },
];

async function main(): Promise<void> {
  await prisma.gameRuleConfiguration.upsert({
    where: { key_version: { key: 'default', version: 1 } },
    update: {},
    create: {
      key: 'default',
      version: 1,
      name: 'Tiến Lên Miền Nam — mặc định',
      isActive: true,
      rules: DEFAULT_RULES_V1,
      allowedEntryFees: [0, 100, 500, 1000, 5000],
      allowedTurnTimers: [15, 30, 45],
    },
  });

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: {
        name: achievement.name,
        description: achievement.description,
        rewardAmount: achievement.rewardAmount,
      },
      create: achievement,
    });
  }

  const [ruleCount, achievementCount] = await Promise.all([
    prisma.gameRuleConfiguration.count(),
    prisma.achievement.count(),
  ]);
  console.log(
    `Seed complete: ${ruleCount} rule configuration(s), ${achievementCount} achievement(s).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
