/* eslint-disable no-console -- CLI script */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_GAME_RULES, gameRulesSchema } from '@tienlen/shared';

// Local-development seed. Idempotent: safe to run repeatedly.
// Seeds reference/configuration data only — no users, balances, or fake matches.
const prisma = new PrismaClient();

// Rule presets are versioned and never edited in place: matches copy them into
// `ruleSnapshot`. Version 1 was a pre-specification draft; version 2 is docs/GAME_RULES.md.
const DEFAULT_RULES_VERSION = 2;

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
  await prisma.$transaction([
    prisma.gameRuleConfiguration.upsert({
      where: { key_version: { key: 'default', version: DEFAULT_RULES_VERSION } },
      update: { isActive: true },
      create: {
        key: 'default',
        version: DEFAULT_RULES_VERSION,
        name: 'Tiến Lên Miền Nam — mặc định',
        isActive: true,
        rules: gameRulesSchema.parse(DEFAULT_GAME_RULES),
        allowedEntryFees: [0, 100, 500, 1000, 5000],
        allowedTurnTimers: [15, 30, 45],
      },
    }),
    // Older versions stay for audit (rooms may reference them) but are no longer offered.
    prisma.gameRuleConfiguration.updateMany({
      where: { key: 'default', version: { not: DEFAULT_RULES_VERSION }, isActive: true },
      data: { isActive: false },
    }),
  ]);

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
