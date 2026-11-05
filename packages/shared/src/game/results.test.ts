import { describe, expect, it } from 'vitest';
import type { CardId } from './cards';
import { LEFTOVER_PENALTY_KINDS } from './hand-analysis';
import { cardLabel, describePenalty, LEFTOVER_PENALTY_RULES, penaltyKey } from './results';
import { DEFAULT_GAME_RULES } from './rules';

const nines = (order: string) => order.split(' ') as CardId[];

describe('penalty records', () => {
  it('explain each item in one sentence', () => {
    expect(cardLabel('10H')).toBe('10♥');
    expect(describePenalty({ kind: 'RED_TWO', cards: ['2H'], points: 2 })).toBe(
      'Thúi heo đỏ (2♥): 2 điểm.',
    );
    expect(describePenalty({ kind: 'REMAINING_CARDS', cards: nines('3S 4S 9H'), points: 3 })).toBe(
      'Phạt lá còn lại (3 lá): 3 điểm.',
    );
  });

  it('have one key per match, seat, kind and cards, whatever the card order', () => {
    const quad = (seat: number, order: string) =>
      penaltyKey('m', seat, { kind: 'FOUR_OF_A_KIND', cards: nines(order), points: 4 });
    expect(quad(1, '9S 9C 9D 9H')).toBe(quad(1, '9H 9D 9C 9S'));
    expect(quad(2, '9S 9C 9D 9H')).not.toBe(quad(1, '9S 9C 9D 9H'));
  });

  it('name an existing rule setting for every kind', () => {
    for (const kind of LEFTOVER_PENALTY_KINDS) {
      expect(DEFAULT_GAME_RULES.leftoverPenalties).toHaveProperty(LEFTOVER_PENALTY_RULES[kind]);
    }
  });
});
