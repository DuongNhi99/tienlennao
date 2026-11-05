'use client';

import {
  type GameRules,
  gameRulesSchema,
  INSTANT_WIN_KINDS,
  INSTANT_WIN_LABELS_VI,
  type InstantWinKind,
  PENALTY_WEIGHT_MAX,
  PLACE_POINTS_LIMIT,
  RULE_VARIANT_KEYS,
  RULE_VARIANTS,
  type RuleVariantKey,
  ruleVariantOf,
  SUIT_SYMBOLS,
  type Suit,
} from '@tienlen/shared';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { ruleSetLabel, summarizeRules } from '@/features/history/rules-summary';

/** Suit orders players actually use; any permutation is valid, these are the common ones. */
const SUIT_ORDERS: Suit[][] = [
  ['S', 'C', 'D', 'H'],
  ['C', 'S', 'D', 'H'],
  ['S', 'C', 'H', 'D'],
];

type Path<T> = (draft: T) => void;

function Section({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-white/10 bg-black/15 open:bg-black/25"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-white/60">{description}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-3">{children}</div>
    </details>
  );
}

function Toggle({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-gold-400' : 'bg-white/20',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="min-w-0 text-sm">
        <span className="block font-medium">{label}</span>
        <span id={`${id}-help`} className="block text-xs text-white/60">
          {help}
        </span>
      </label>
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Math.trunc(Number(event.target.value));
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
        }}
        className="min-h-11 w-20 rounded-lg border border-white/20 bg-felt-950/60 px-2 text-right tabular-nums focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/40 disabled:opacity-60"
      />
    </div>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string; help: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-white/15 px-3 py-2 has-checked:border-gold-400 has-checked:bg-gold-400/10"
        >
          <input
            type="radio"
            name={name}
            className="mt-1 size-4 accent-gold-400"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="text-sm">
            <span className="block font-medium">{option.label}</span>
            <span className="block text-xs text-white/60">{option.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface RuleEditorProps {
  value: GameRules;
  onChange: (rules: GameRules) => void;
  /** Read-only (e.g. the rules of a series are fixed after its first round). */
  disabled?: boolean;
}

/**
 * Room rules (docs/GAME_RULES.md): a preset to start from, then every configurable rule grouped
 * by topic with an explanation, a reset to the chosen preset and a summary of the result. The
 * server validates the same schema again; nothing here decides legality during play.
 */
export function RuleEditor({ value, onChange, disabled = false }: RuleEditorProps) {
  const variant = ruleVariantOf(value);
  const [base, setBase] = useState<RuleVariantKey>(variant === 'CUSTOM' ? 'STANDARD' : variant);
  const update = (edit: Path<GameRules>) => {
    const draft = structuredClone(value);
    edit(draft);
    const parsed = gameRulesSchema.safeParse(draft);
    // Edits that would make the rules invalid (e.g. a worse place scoring more) are ignored.
    if (parsed.success) onChange(parsed.data);
  };
  const { bombs, leftoverPenalties: penalties, scoring } = value;
  const toggleInstantWin = (kind: InstantWinKind, on: boolean) =>
    update((draft) => {
      const enabled = new Set(draft.instantWins);
      if (on) enabled.add(kind);
      else enabled.delete(kind);
      // Priority stays the documented order.
      draft.instantWins = INSTANT_WIN_KINDS.filter((k) => enabled.has(k));
    });
  const pointsRow = (players: 'four' | 'three' | 'two', label: string) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {scoring.placementPoints[players].map((points, index) => (
          <NumberInput
            key={index}
            label={`Hạng ${index + 1}`}
            value={points}
            min={-PLACE_POINTS_LIMIT}
            max={PLACE_POINTS_LIMIT}
            disabled={disabled}
            onChange={(next) =>
              update((draft) => {
                draft.scoring.placementPoints[players][index] = next;
              })
            }
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Bộ luật: <span className="text-gold-300">{ruleSetLabel(value)}</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {RULE_VARIANT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={variant === key}
              onClick={() => {
                setBase(key);
                onChange(RULE_VARIANTS[key].rules);
              }}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60',
                variant === key
                  ? 'border-gold-400 bg-gold-400/10'
                  : 'border-white/15 hover:bg-white/5',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {RULE_VARIANTS[key].label}
                {RULE_VARIANTS[key].kind === 'REGIONAL' ? (
                  <span className="rounded bg-white/10 px-1.5 text-[0.65rem] font-semibold uppercase">
                    vùng miền
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-white/60">{RULE_VARIANTS[key].description}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw aria-hidden className="size-4" />}
            disabled={disabled || variant === base}
            onClick={() => onChange(RULE_VARIANTS[base].rules)}
          >
            Đặt lại theo “{RULE_VARIANTS[base].label}”
          </Button>
          {variant === 'CUSTOM' ? (
            <span className="text-xs text-white/60">Đã chỉnh sửa so với bộ luật có sẵn.</span>
          ) : null}
        </div>
      </fieldset>

      <Section title="Luật chung" description="Ai đi trước, lượt đầu, khi nào ván kết thúc">
        <ChoiceGroup
          legend="Lượt đầu tiên của ván"
          value={value.opening}
          disabled={disabled}
          options={[
            {
              value: 'HOLDER_MUST_PLAY_LOWEST',
              label: 'Phải đánh lá nhỏ nhất',
              help: 'Người giữ lá nhỏ nhất (3♠ khi đủ 4 người) phải đánh bộ có lá đó.',
            },
            {
              value: 'HOLDER_LEADS_FREELY',
              label: 'Đánh tự do',
              help: 'Người giữ lá nhỏ nhất đi trước và đánh bộ nào cũng được.',
            },
          ]}
          onChange={(opening) => update((d) => void (d.opening = opening))}
        />
        <ChoiceGroup
          legend="Người đi trước"
          value={value.starter}
          disabled={disabled}
          options={[
            { value: 'LOWEST_CARD', label: 'Người giữ lá nhỏ nhất', help: 'Mọi ván như nhau.' },
            {
              value: 'PREVIOUS_WINNER',
              label: 'Người thắng ván trước',
              help: 'Ở ván chơi tiếp, người về nhất ván trước đi trước và đánh tự do.',
            },
          ]}
          onChange={(starter) => update((d) => void (d.starter = starter))}
        />
        <ChoiceGroup
          legend="Kết thúc ván"
          value={value.endCondition}
          disabled={disabled}
          options={[
            {
              value: 'ALL_PLACEMENTS',
              label: 'Đánh đến khi đủ thứ hạng',
              help: 'Chơi tiếp đến khi chỉ còn một người còn bài (người đó về bét).',
            },
            {
              value: 'FIRST_FINISHER',
              label: 'Nhất ăn tất',
              help: 'Ván dừng khi có người hết bài; người còn lại xếp theo số lá ít hơn.',
            },
          ]}
          onChange={(endCondition) => update((d) => void (d.endCondition = endCondition))}
        />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Thứ tự chất (thấp → cao)</span>
          <select
            disabled={disabled}
            value={value.suitOrder.join('')}
            onChange={(event) =>
              update((d) => void (d.suitOrder = event.target.value.split('') as Suit[]))
            }
            className="min-h-11 rounded-lg border border-white/20 bg-felt-950/60 px-3"
          >
            {[
              ...SUIT_ORDERS,
              ...(SUIT_ORDERS.some((o) => o.join('') === value.suitOrder.join(''))
                ? []
                : [value.suitOrder]),
            ].map((order) => (
              <option key={order.join('')} value={order.join('')}>
                {order.map((s) => SUIT_SYMBOLS[s]).join(' < ')}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section
        title="Bộ bài và tới trắng"
        description="Các bộ thắng ngay khi chia bài, theo thứ tự ưu tiên"
      >
        <p className="text-xs text-white/60">
          Lẻ, đôi, sám cô, sảnh, đôi thông và tứ quý luôn được dùng. 2 (heo) không bao giờ nằm trong
          sảnh hay đôi thông.
        </p>
        {INSTANT_WIN_KINDS.map((kind) => (
          <Toggle
            key={kind}
            label={INSTANT_WIN_LABELS_VI[kind]}
            help="Thắng trắng ngay sau khi chia bài, không ai phải đánh."
            checked={value.instantWins.includes(kind)}
            disabled={disabled}
            onChange={(on) => toggleInstantWin(kind, on)}
          />
        ))}
      </Section>

      <Section title="Luật chặt" description="Bộ nào được chặt heo, chặt bom và khi nào">
        <Toggle
          label="3 đôi thông chặt heo"
          help="Ba đôi liên tiếp chặt được một lá 2."
          checked={bombs.threeConsecutivePairs}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.bombs.threeConsecutivePairs = on))}
        />
        <Toggle
          label="3 đôi thông chặt đôi heo"
          help="Chỉ áp dụng khi 3 đôi thông được chặt heo."
          checked={bombs.threeConsecutivePairsBeatPairOfTwos}
          disabled={disabled || !bombs.threeConsecutivePairs}
          onChange={(on) => update((d) => void (d.bombs.threeConsecutivePairsBeatPairOfTwos = on))}
        />
        <Toggle
          label="Tứ quý chặt heo và đôi heo"
          help="Bốn lá cùng số chặt một lá 2 hoặc đôi 2 (và 3 đôi thông nếu bật chặt chồng)."
          checked={bombs.fourOfAKind}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.bombs.fourOfAKind = on))}
        />
        <Toggle
          label="4 đôi thông chặt heo và đôi heo"
          help="Bốn đôi liên tiếp trở lên chặt một lá 2 hoặc đôi 2 (và tứ quý nếu bật chặt chồng)."
          checked={bombs.fourConsecutivePairs}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.bombs.fourConsecutivePairs = on))}
        />
        <Toggle
          label="Chặt chồng (bom chặt bom)"
          help="Tứ quý chặt 3 đôi thông; 4 đôi thông chặt tứ quý. Tắt: bom chỉ chặt heo."
          checked={bombs.bombsBeatBombs}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.bombs.bombsBeatBombs = on))}
        />
        <Toggle
          label="Chặt ngang"
          help="Được chặt bất cứ lúc nào, kể cả khi chưa tới lượt hay đã bỏ lượt."
          checked={bombs.outOfTurn}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.bombs.outOfTurn = on))}
        />
      </Section>

      <Section
        title="Heo (2) và phạt"
        description="Điểm phạt cho bài còn trên tay khi ván kết thúc; 0 là không phạt"
      >
        <p className="text-xs text-white/60">
          Mỗi lá chỉ bị tính một lần cho mỗi loại phạt. Cóng (chưa đánh lá nào) thay cho phạt từng
          lá; heo và bom còn lại vẫn bị phạt. Nước đi sai luật luôn bị từ chối, không bị phạt điểm.
        </p>
        {(
          [
            ['blackTwo', 'Mỗi heo đen (2♠, 2♣)'],
            ['redTwo', 'Mỗi heo đỏ (2♦, 2♥)'],
            ['fourOfAKind', 'Mỗi tứ quý còn lại'],
            ['threeConsecutivePairs', 'Mỗi 3 đôi thông còn lại'],
            ['fourConsecutivePairs', 'Mỗi 4 đôi thông trở lên'],
            ['perCard', 'Mỗi lá còn lại'],
            ['unplayedHand', 'Cóng (chưa đánh lá nào)'],
          ] as const
        ).map(([key, label]) => (
          <NumberInput
            key={key}
            label={label}
            value={penalties[key]}
            min={0}
            max={PENALTY_WEIGHT_MAX}
            disabled={disabled}
            onChange={(next) => update((d) => void (d.leftoverPenalties[key] = next))}
          />
        ))}
      </Section>

      <Section
        title="Tính điểm ván"
        description="Điểm theo thứ hạng, dùng cho chuỗi ván và xếp hạng"
      >
        {pointsRow('four', 'Bàn 4 người')}
        {pointsRow('three', 'Bàn 3 người')}
        {pointsRow('two', 'Bàn 2 người')}
        <Toggle
          label="Trừ điểm phạt vào điểm ván"
          help="Điểm ván = điểm thứ hạng − điểm phạt. Tắt: điểm phạt chỉ để xem."
          checked={scoring.subtractPenalties}
          disabled={disabled}
          onChange={(on) => update((d) => void (d.scoring.subtractPenalties = on))}
        />
      </Section>

      <Section title="Xem lại toàn bộ luật" description="Tóm tắt những gì sẽ áp dụng cho ván">
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {summarizeRules(value).map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-white/60">{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
