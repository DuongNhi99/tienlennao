'use client';

import type { AchievementItem, PlayerStatistics } from '@tienlen/shared';
import { Award, Lock } from 'lucide-react';
import Link from 'next/link';
import { BarChart, HorizontalBars } from '@/components/charts/bar-chart';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { formatCoins, formatDate, formatDateTime, formatPercent } from '@/lib/format';

const PLACE_LABELS = ['Nhất', 'Nhì', 'Ba', 'Bét (4)'];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <dt className="text-xs text-white/60">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-[0.7rem] text-white/50">{hint}</dd> : null}
    </div>
  );
}

const weekLabel = (iso: string) => formatDate(iso).slice(0, 5);

/**
 * A player's statistics. Every figure counts finished rounds (one hand each); aborted rounds
 * never count. Series (multi-round matches) are counted separately.
 */
export function StatisticsDashboard({ stats }: { stats: PlayerStatistics }) {
  if (stats.roundsPlayed === 0) {
    return (
      <EmptyState
        icon={Award}
        title="Chưa có ván nào kết thúc"
        description="Thống kê xuất hiện sau ván đầu tiên."
      />
    );
  }
  const losses = stats.roundsPlayed - stats.roundsWon;
  const weeks = stats.weekly.map((w) => weekLabel(w.weekStart));
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Số ván" value={formatCoins(stats.roundsPlayed)} />
        <Tile
          label="Thắng / thua"
          value={`${stats.roundsWon} / ${losses}`}
          hint="Thắng = về nhất"
        />
        <Tile label="Tỉ lệ thắng" value={formatPercent(stats.winRate)} />
        <Tile
          label="Hạng trung bình"
          value={stats.averagePlace === null ? '—' : stats.averagePlace.toLocaleString('vi-VN')}
        />
        <Tile label="Tổng điểm ván" value={formatCoins(stats.totalScore)} />
        <Tile
          label="Chuỗi thắng"
          value={`${stats.streaks.currentWin} (tốt nhất ${stats.streaks.bestWin})`}
        />
        <Tile label="Chuỗi thua dài nhất" value={String(stats.streaks.longestLoss)} />
        <Tile label="Chuỗi ván (thắng)" value={`${stats.series.played} (${stats.series.won})`} />
        <Tile label="Lá đã đánh" value={formatCoins(stats.cardsPlayed)} />
        <Tile
          label="Chặt / bị chặt"
          value={`${stats.chopsMade} / ${stats.chopsReceived}`}
          hint={`Chặt heo ${stats.twosChopped} lần`}
        />
        <Tile label="Heo bị thúi" value={String(stats.twosLeft)} />
        <Tile label="Tổng điểm phạt" value={formatCoins(stats.penaltyPoints)} />
      </dl>

      <div className="grid gap-5 lg:grid-cols-2">
        <HorizontalBars
          title="Phân bố thứ hạng"
          rows={stats.placements.map((p) => ({
            label: PLACE_LABELS[p.place - 1]!,
            value: p.count,
          }))}
        />
        <BarChart
          title="Số ván và số ván thắng theo tuần (12 tuần)"
          categories={weeks}
          series={[
            { key: 'played', label: 'Số ván', values: stats.weekly.map((w) => w.played) },
            { key: 'won', label: 'Thắng', values: stats.weekly.map((w) => w.won) },
          ]}
          details={(i) => [
            `Điểm ván: ${stats.weekly[i]!.score}`,
            `Điểm phạt: ${stats.weekly[i]!.penaltyPoints}`,
          ]}
        />
        <BarChart
          title="Điểm phạt theo tuần"
          categories={weeks}
          series={[
            {
              key: 'penalty',
              label: 'Điểm phạt',
              values: stats.weekly.map((w) => w.penaltyPoints),
            },
          ]}
          height={120}
        />
      </div>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
        <h3 id="recent-heading" className="text-sm font-semibold">
          Ván gần đây
        </h3>
        <ul className="flex flex-col gap-1">
          {stats.recent.map((r) => (
            <li key={r.matchId}>
              <Link
                href={`/history/${r.matchId}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <span>
                  Hạng {r.placement}/{r.players}
                  <span className="ml-2 text-xs text-white/60">{formatDateTime(r.finishedAt)}</span>
                </span>
                <span className="tabular-nums text-white/80">
                  {r.roundScore === null
                    ? ''
                    : `${r.roundScore > 0 ? '+' : ''}${r.roundScore} điểm`}
                  {r.penaltyPoints ? ` · phạt ${r.penaltyPoints}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-white/50">
        Thống kê tính theo ván đã kết thúc hợp lệ (ván bị hủy không tính). Tuần bắt đầu thứ Hai, giờ
        Việt Nam.
      </p>
    </div>
  );
}

export function AchievementsList({ items }: { items: AchievementItem[] }) {
  const unlocked = items.filter((a) => a.unlockedAt).length;
  return (
    <section aria-labelledby="achievements-heading" className="flex flex-col gap-3">
      <h2 id="achievements-heading" className="font-semibold">
        Thành tích ({unlocked}/{items.length})
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((a) => (
          <li
            key={a.code}
            className={cn(
              'flex items-start gap-3 rounded-xl border px-3 py-2',
              a.unlockedAt ? 'border-gold-400/50 bg-gold-400/10' : 'border-white/10 bg-black/15',
            )}
          >
            {a.unlockedAt ? (
              <Award aria-hidden className="mt-0.5 size-5 shrink-0 text-gold-400" />
            ) : (
              <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-white/40" />
            )}
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">{a.name}</span>
              <span className="block text-xs text-white/70">{a.description}</span>
              <span className="block text-xs text-white/50">
                {a.unlockedAt ? `Đạt ngày ${formatDate(a.unlockedAt)}` : 'Chưa đạt'}
                {a.rewardAmount ? ` · thưởng ${formatCoins(a.rewardAmount)} xu` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
