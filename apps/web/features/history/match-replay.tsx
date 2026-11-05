'use client';

import { buildReplay, type TimelineEvent } from '@tienlen/shared';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play } from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { PlayingCard } from '@/components/game/playing-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { describeEvent } from './describe-event';

interface MatchReplayProps {
  timeline: TimelineEvent[];
  players: number;
  name: (seat: number | null) => string;
}

const STEP_MS = 1200;
const SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Step-through replay of the public timeline: the table, card counts, passes and places after
 * each move. Hands are never shown — the deal is not part of the history.
 */
export function MatchReplay({ timeline, players, name }: MatchReplayProps) {
  const frames = useMemo(() => buildReplay(timeline, players), [timeline, players]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const last = frames.length - 1;
  const frame = frames[Math.min(index, last)]!;

  // Auto-play advances one step at a time and stops on the last frame.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setIndex(Math.min(index + 1, last));
      if (index + 1 >= last) setPlaying(false);
    }, STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, index, last, speed]);

  const go = (to: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(to, last)));
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Người chơi">
        {frame.cardCounts.map((count, seat) => {
          const acting = frame.event?.seatIndex === seat;
          const place = frame.places[seat];
          return (
            <li
              key={seat}
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                acting ? 'bg-gold-400/20 ring-1 ring-gold-400' : 'bg-white/5',
              )}
            >
              <span className="block truncate font-semibold">{name(seat)}</span>
              <span className="text-xs text-white/70">
                {place ? `Về hạng ${place}` : `${count} lá`}
                {frame.passed[seat] ? ' · bỏ lượt' : ''}
              </span>
            </li>
          );
        })}
      </ul>

      <div
        role="region"
        aria-label="Bàn chơi"
        aria-live="polite"
        className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-xl bg-felt-900/60 p-3 text-center"
        style={{ '--card-w': 'clamp(2.25rem, 8vw, 3.25rem)' } as CSSProperties}
      >
        {frame.table ? (
          <div className="flex">
            {frame.table.cards.map((card, i) => (
              <PlayingCard
                key={card}
                card={card}
                className={i === 0 ? '' : '-ml-[calc(var(--card-w)*0.45)]'}
              />
            ))}
          </div>
        ) : null}
        <p className="text-sm text-white/85">
          {frame.event ? describeEvent(frame.event, name) : 'Chia bài — mỗi người 13 lá'}
          {frame.timedOut ? ' (hết giờ)' : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Về đầu"
          icon={<ChevronsLeft aria-hidden className="size-4" />}
          onClick={() => go(0)}
          disabled={index === 0}
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Bước trước"
          icon={<ChevronLeft aria-hidden className="size-4" />}
          onClick={() => go(index - 1)}
          disabled={index === 0}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={
            playing ? (
              <Pause aria-hidden className="size-4" />
            ) : (
              <Play aria-hidden className="size-4" />
            )
          }
          onClick={() => {
            if (index >= last) setIndex(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Dừng' : 'Phát lại'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Bước sau"
          icon={<ChevronRight aria-hidden className="size-4" />}
          onClick={() => go(index + 1)}
          disabled={index >= last}
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label="Đến cuối"
          icon={<ChevronsRight aria-hidden className="size-4" />}
          onClick={() => go(last)}
          disabled={index >= last}
        />
      </div>
      <div role="radiogroup" aria-label="Tốc độ phát lại" className="flex justify-center gap-1">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={speed === value}
            onClick={() => setSpeed(value)}
            className={cn(
              'min-h-9 rounded-full px-3 text-xs font-medium',
              speed === value ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10',
            )}
          >
            {value.toLocaleString('vi-VN')}×
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 text-xs text-white/70">
        <span className="tabular-nums">
          Bước {index}/{last}
        </span>
        <input
          type="range"
          min={0}
          max={last}
          value={index}
          onChange={(event) => go(Number(event.target.value))}
          className="flex-1 accent-gold-400"
          aria-label="Chọn bước"
        />
      </label>
    </div>
  );
}
