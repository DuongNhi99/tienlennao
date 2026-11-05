/* eslint-disable no-console -- CLI script */
import { PrismaClient } from '@prisma/client';
import {
  calculateMatchResult,
  describePenalty,
  LEFTOVER_PENALTY_RULES,
  penaltyKey,
  restoreMatchState,
  roundStatistics,
} from '@tienlen/shared';

/**
 * Fills in the per-round statistics (`match_players.roundScore`, `penaltyPoints`, …) and the
 * penalty records (`match_penalties`) of rounds settled before they existed, from each round's
 * final engine state — exactly what settlement writes today. Idempotent: rounds that already have
 * statistics are skipped, and penalty records are unique by key. Placements, coins and events
 * are never touched.
 *
 *   pnpm db:backfill
 */
const prisma = new PrismaClient();
const BATCH = 100;

async function main(): Promise<void> {
  let updated = 0;
  const skipped: string[] = [];
  for (;;) {
    const matches = await prisma.match.findMany({
      where: {
        status: 'FINISHED',
        id: { notIn: skipped },
        players: { some: { roundScore: null } },
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: {
        id: true,
        stateSnapshot: true,
        players: { select: { seatIndex: true, userId: true } },
      },
    });
    if (matches.length === 0) break;
    for (const match of matches) {
      const snapshot = match.stateSnapshot as { engine?: unknown } | null;
      const restored = restoreMatchState(snapshot?.engine);
      if (!restored.ok || restored.state.status !== 'FINISHED') {
        console.warn(`Match ${match.id}: unreadable final state, left as it is.`);
        skipped.push(match.id);
        continue;
      }
      const outcome = calculateMatchResult(restored.state);
      const stats = roundStatistics(outcome, restored.state.rules.cardsPerPlayer);
      const userAt = (seat: number) => match.players.find((p) => p.seatIndex === seat)!.userId;
      await prisma.$transaction([
        ...stats.map(({ seat, placement: _placement, ...values }) =>
          prisma.matchPlayer.update({
            where: { matchId_seatIndex: { matchId: match.id, seatIndex: seat } },
            data: values,
          }),
        ),
        prisma.matchPenalty.createMany({
          data: outcome.placements.flatMap((p) =>
            p.penalties.map((item) => ({
              matchId: match.id,
              userId: userAt(p.seat),
              seatIndex: p.seat,
              kind: item.kind,
              cards: item.cards,
              points: item.points,
              rule: `leftoverPenalties.${LEFTOVER_PENALTY_RULES[item.kind]}`,
              explanation: describePenalty(item),
              penaltyKey: penaltyKey(match.id, p.seat, item),
            })),
          ),
          skipDuplicates: true,
        }),
      ]);
      updated++;
    }
  }
  console.log(`Backfill complete: ${updated} round(s) updated, ${skipped.length} skipped.`);
}

main()
  .catch((error: unknown) => {
    console.error('Backfill failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
