'use client';

import { type CSSProperties, useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Chart colours, validated for the felt surface (#0b4a2f) with the data-viz palette validator:
 * lightness band, chroma, colour-vision separation and ≥ 3:1 contrast all pass. Fixed order:
 * slot 1 for the main measure, slot 2 for the second. Text never wears these colours.
 */
export const CHART_SERIES = ['#4f93ea', '#c98500'] as const;

export interface BarSeries {
  key: string;
  label: string;
  values: number[];
}

interface BarChartProps {
  /** Accessible title; also the caption of the table view. */
  title: string;
  categories: string[];
  series: BarSeries[];
  /** Extra tooltip lines per category (e.g. score and penalties). */
  details?: (index: number) => string[];
  height?: number;
  format?: (value: number) => string;
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

/**
 * Vertical grouped bars on one axis (never two scales). Each category is focusable; hover or
 * focus shows its values. A legend appears for two or more series, and the same numbers are
 * available as a table.
 */
export function BarChart({
  title,
  categories,
  series,
  details,
  height = 160,
  format = String,
}: BarChartProps) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const ticks = [max, max / 2, 0];

  return (
    <figure className="flex flex-col gap-2" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="text-sm font-semibold">
        {title}
      </figcaption>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-3 text-xs text-white/80" aria-label="Chú thích">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: CHART_SERIES[i] }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <div
          aria-hidden
          className="flex flex-col justify-between text-right text-[0.65rem] tabular-nums text-white/50"
          style={{ height }}
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* Recessive grid. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 flex flex-col justify-between"
            style={{ height }}
          >
            {ticks.map((t) => (
              <span key={t} className="block border-t border-white/10" />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }}>
            {categories.map((category, ci) => (
              <div
                key={category}
                tabIndex={0}
                role="img"
                aria-label={`${category}: ${series.map((s) => `${s.label} ${format(s.values[ci] ?? 0)}`).join(', ')}`}
                onMouseEnter={() => setActive(ci)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(ci)}
                onBlur={() => setActive(null)}
                className={cn(
                  'relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-sm px-[1px] outline-none',
                  active === ci && 'bg-white/5',
                )}
              >
                {series.map((s, si) => {
                  const value = s.values[ci] ?? 0;
                  return (
                    <span
                      key={s.key}
                      aria-hidden
                      className="block w-full max-w-3 rounded-t-[4px]"
                      style={
                        {
                          height: value > 0 ? `max(2px, ${(value / max) * 100}%)` : 0,
                          background: CHART_SERIES[si],
                        } as CSSProperties
                      }
                    />
                  );
                })}
                {active === ci ? (
                  <span
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-lg border border-white/15 bg-felt-950 px-2.5 py-1.5 text-left text-xs shadow-lg',
                      ci > categories.length / 2 ? 'right-0' : 'left-0',
                    )}
                  >
                    <span className="block font-semibold">{category}</span>
                    {series.map((s, si) => (
                      <span key={s.key} className="flex items-center gap-1.5 text-white/85">
                        <span
                          aria-hidden
                          className="size-2 rounded-sm"
                          style={{ background: CHART_SERIES[si] }}
                        />
                        {s.label}: {format(s.values[ci] ?? 0)}
                      </span>
                    ))}
                    {details?.(ci).map((line) => (
                      <span key={line} className="block text-white/70">
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-1 flex gap-[2px] text-[0.6rem] text-white/50">
            {categories.map((category, ci) => (
              <span key={category} className="flex-1 truncate text-center">
                {/* Every other label on narrow charts, so they never collide. */}
                {categories.length > 8 && ci % 2 === 1 ? '' : category}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="text-xs text-white/70">
        <summary className="cursor-pointer">Xem dạng bảng</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-normal">
                &nbsp;
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="text-right font-normal">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category, ci) => (
              <tr key={category}>
                <th scope="row" className="text-left font-normal">
                  {category}
                </th>
                {series.map((s) => (
                  <td key={s.key} className="text-right tabular-nums">
                    {format(s.values[ci] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars for a few labelled counts (e.g. finishing places), each labelled directly. */
export function HorizontalBars({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold">{title}</figcaption>
      <ul className="flex flex-col gap-[6px]">
        {rows.map((row) => {
          const share = total ? Math.round((row.value * 100) / total) : 0;
          return (
            <li
              key={row.label}
              tabIndex={0}
              title={`${row.label}: ${row.value} ván (${share}%)`}
              aria-label={`${row.label}: ${row.value} ván, ${share}%`}
              className="grid grid-cols-[4rem_1fr_4.5rem] items-center gap-2 rounded-sm text-xs outline-none hover:bg-white/5 focus-visible:bg-white/5"
            >
              <span className="text-white/80">{row.label}</span>
              <span aria-hidden className="h-3 rounded-r-[4px] bg-white/5">
                <span
                  className="block h-full rounded-r-[4px]"
                  style={{
                    width: row.value ? `max(2px, ${(row.value / max) * 100}%)` : 0,
                    background: CHART_SERIES[0],
                  }}
                />
              </span>
              <span className="text-right tabular-nums text-white/85">
                {row.value} · {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
