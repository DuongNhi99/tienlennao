import {
  type CardId,
  LEFTOVER_PENALTY_LABELS_VI,
  type LeftoverPenaltyKind,
  sortCards,
} from '@tienlen/shared';

interface Penalty {
  kind: LeftoverPenaltyKind;
  cards: CardId[];
  points: number;
}

export interface PenaltyLine {
  label: string;
  cards: CardId[];
  points: number;
  /** Thúi heo (2s), shown first and highlighted. */
  twos: boolean;
}

const TWOS_LABELS = ['', 'Thúi heo', 'Thúi đôi heo', 'Thúi ba heo', 'Thúi tứ quý heo'];

/**
 * Penalty items as lines for the results screen: every 2 together in one "thúi heo" line
 * (a single 2, a pair of 2s …, with each 2's points added up), then each bomb left in hand.
 */
export function summarizePenalties(penalties: readonly Penalty[]): PenaltyLine[] {
  const twos = penalties.filter((p) => p.kind === 'BLACK_TWO' || p.kind === 'RED_TWO');
  const lines: PenaltyLine[] = [];
  if (twos.length) {
    lines.push({
      label: TWOS_LABELS[twos.length] ?? TWOS_LABELS[1]!,
      cards: sortCards(twos.flatMap((p) => p.cards)),
      points: twos.reduce((sum, p) => sum + p.points, 0),
      twos: true,
    });
  }
  for (const p of penalties) {
    if (p.kind === 'BLACK_TWO' || p.kind === 'RED_TWO') continue;
    lines.push({
      label: LEFTOVER_PENALTY_LABELS_VI[p.kind],
      cards: p.cards,
      points: p.points,
      twos: false,
    });
  }
  return lines;
}
