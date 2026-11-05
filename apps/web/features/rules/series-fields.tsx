'use client';

import {
  SERIES_MAX_ROUNDS,
  SERIES_MAX_TARGET_SCORE,
  type SeriesSettingsInput,
  type SeriesSummary,
} from '@tienlen/shared';
import { useId } from 'react';

export interface SeriesChoice {
  mode: 'SINGLE' | 'ROUNDS' | 'TARGET_SCORE' | 'MANUAL';
  rounds: number;
  score: number;
}

export function toSeriesSettings(choice: SeriesChoice): SeriesSettingsInput {
  if (choice.mode === 'ROUNDS') return { endCondition: 'ROUNDS', targetRounds: choice.rounds };
  if (choice.mode === 'TARGET_SCORE') {
    return { endCondition: 'TARGET_SCORE', targetScore: choice.score };
  }
  return { endCondition: 'MANUAL' };
}

/** "Ván 2/5", "Ván 3 · đến 20 điểm", "Ván 4". */
export function describeSeries(series: SeriesSummary, roundNumber: number | null): string {
  const round = roundNumber ? `Ván ${roundNumber}` : `${series.roundsPlayed} ván`;
  if (series.endCondition === 'ROUNDS') return `${round}/${series.targetRounds}`;
  if (series.endCondition === 'TARGET_SCORE') return `${round} · đến ${series.targetScore} điểm`;
  return `${round} · chủ phòng kết thúc`;
}

/** One round, or a multi-round match ending by rounds, target score or the host. */
export function SeriesFields({
  value,
  onChange,
}: {
  value: SeriesChoice;
  onChange: (value: SeriesChoice) => void;
}) {
  const name = useId();
  const options: { mode: SeriesChoice['mode']; label: string; help: string }[] = [
    { mode: 'SINGLE', label: 'Một ván', help: 'Mỗi ván là một trận riêng.' },
    { mode: 'ROUNDS', label: 'Chuỗi ván cố định', help: 'Cộng điểm qua số ván đã chọn.' },
    { mode: 'TARGET_SCORE', label: 'Đến điểm mục tiêu', help: 'Dừng khi có người đạt đủ điểm.' },
    { mode: 'MANUAL', label: 'Chủ phòng kết thúc', help: 'Cộng điểm đến khi chủ phòng dừng.' },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-white/90">Thể thức</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.mode}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-white/15 px-3 py-2 has-checked:border-gold-400 has-checked:bg-gold-400/10"
          >
            <input
              type="radio"
              name={name}
              className="mt-1 size-4 accent-gold-400"
              checked={value.mode === option.mode}
              onChange={() => onChange({ ...value, mode: option.mode })}
            />
            <span className="text-sm">
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-white/60">{option.help}</span>
            </span>
          </label>
        ))}
      </div>
      {value.mode === 'ROUNDS' ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          Số ván
          <input
            type="number"
            min={1}
            max={SERIES_MAX_ROUNDS}
            value={value.rounds}
            onChange={(e) =>
              onChange({
                ...value,
                rounds: Math.max(1, Math.min(SERIES_MAX_ROUNDS, Number(e.target.value) || 1)),
              })
            }
            className="min-h-11 w-24 rounded-lg border border-white/20 bg-felt-950/60 px-2 text-right"
          />
        </label>
      ) : null}
      {value.mode === 'TARGET_SCORE' ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          Điểm mục tiêu
          <input
            type="number"
            min={1}
            max={SERIES_MAX_TARGET_SCORE}
            value={value.score}
            onChange={(e) =>
              onChange({
                ...value,
                score: Math.max(1, Math.min(SERIES_MAX_TARGET_SCORE, Number(e.target.value) || 1)),
              })
            }
            className="min-h-11 w-24 rounded-lg border border-white/20 bg-felt-950/60 px-2 text-right"
          />
        </label>
      ) : null}
    </fieldset>
  );
}
