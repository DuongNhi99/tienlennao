import {
  type CardId,
  classifyCombination,
  DEFAULT_GAME_RULES,
  type GameRules,
  type PlayerGameView,
} from '@tienlen/shared';
import { describe, expect, it } from 'vitest';
import { summarizePenalties } from '@/features/room/penalty-summary';
import { nameCombination, playHint } from '@/features/room/play-hint';

const cards = (text: string) => text.split(' ') as CardId[];
const seat = (seatIndex: number) => ({
  userId: `00000000-0000-4000-8000-00000000000${seatIndex + 1}`,
  displayName: `P${seatIndex}`,
  avatarUrl: null,
  seatIndex,
  cardCount: 5,
  hasPassed: false,
  finishedPlace: null,
  connected: true,
  revealedCards: null,
});

function view(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  return {
    matchId: '00000000-0000-4000-8000-0000000000aa',
    roomId: '00000000-0000-4000-8000-0000000000bb',
    status: 'PLAYING',
    stateVersion: 3,
    entryFee: 0,
    mySeat: 0,
    myHand: cards('5S 5C 6S 6C 7S 7C 9H 2D'),
    seats: [0, 1, 2, 3].map(seat),
    currentTrick: null,
    turnSeat: 0,
    turnDeadline: null,
    canPass: false,
    rules: DEFAULT_GAME_RULES,
    openingCard: null,
    spectatorCount: 0,
    roundNumber: null,
    ...overrides,
  };
}

describe('playHint', () => {
  it('prompts for the opening card, then accepts a play containing it', () => {
    const v = view({ myHand: cards('3S 4S 5D 9H'), openingCard: '3S' });
    expect(playHint(v, [])).toMatchObject({ canPlay: false, message: /có 3 bích/ });
    expect(playHint(v, cards('9H'))).toMatchObject({
      canPlay: false,
      message: 'Lượt đầu phải có 3 bích',
    });
    expect(playHint(v, cards('3S 4S 5D'))).toMatchObject({
      canPlay: true,
      message: 'Sảnh 3 lá · 3 lá',
    });
  });

  it('disables plays that cannot beat the table and says what is on it', () => {
    const v = view({ currentTrick: { seatIndex: 3, cards: cards('KH KD') }, canPass: true });
    expect(playHint(v, [])).toMatchObject({ message: 'Chặn đôi K hoặc bỏ lượt' });
    expect(playHint(v, cards('5S 5C'))).toMatchObject({
      canPlay: false,
      message: 'Đôi · 2 lá · không chặn được đôi K',
    });
    expect(playHint(v, cards('5S 9H'))).toMatchObject({
      canPlay: false,
      message: 'Không phải bộ hợp lệ',
    });
  });

  it('marks a chop of a 2', () => {
    const v = view({ currentTrick: { seatIndex: 3, cards: cards('2H') } });
    expect(playHint(v, cards('5S 5C 6S 6C 7S 7C'))).toMatchObject({
      canPlay: true,
      chop: true,
      message: '3 đôi thông · 6 lá — chặt!',
    });
  });

  it('allows a chop out of turn only where the rules do', () => {
    const table = { seatIndex: 3, cards: cards('2H') };
    const bomb = cards('5S 5C 6S 6C 7S 7C');
    const standard = view({ turnSeat: 1, currentTrick: table });
    expect(playHint(standard, bomb)).toMatchObject({ canPlay: false, message: /chưa tới lượt/ });
    const rules: GameRules = {
      ...DEFAULT_GAME_RULES,
      bombs: { ...DEFAULT_GAME_RULES.bombs, outOfTurn: true },
    };
    expect(playHint({ ...standard, rules }, bomb)).toMatchObject({
      canPlay: true,
      outOfTurn: true,
      message: /chặt ngang/,
    });
  });

  it('reports a pass lock-out when nothing is selected', () => {
    const seats = [0, 1, 2, 3].map(seat);
    seats[0] = { ...seats[0]!, hasPassed: true };
    const v = view({ turnSeat: 2, seats, currentTrick: { seatIndex: 1, cards: cards('9S') } });
    expect(playHint(v, [])).toMatchObject({ message: 'Bạn đã bỏ lượt vòng này' });
  });

  it('falls back to the combination shape with an API that sends no rules', () => {
    const v = view({ rules: null, currentTrick: { seatIndex: 3, cards: cards('KH KD') } });
    // The server decides whether it beats the table.
    expect(playHint(v, cards('5S 5C'))).toMatchObject({ canPlay: true, message: 'Đôi · 2 lá' });
  });
});

describe('nameCombination', () => {
  it.each([
    ['2H', '2 cơ'],
    ['KH KD', 'đôi K'],
    ['9S 9C 9D', 'sám cô 9'],
    ['10S JC QD KH AS', 'sảnh 5 lá đến A'],
    ['5S 5C 6S 6C 7S 7C', '3 đôi thông'],
    ['8S 8C 8D 8H', 'tứ quý 8'],
  ])('%s → %s', (text, name) => {
    expect(nameCombination(classifyCombination(cards(text), DEFAULT_GAME_RULES)!)).toBe(name);
  });
});

describe('summarizePenalties', () => {
  it('groups the 2s into one thúi heo line, then lists bombs', () => {
    expect(
      summarizePenalties([
        { kind: 'RED_TWO', cards: ['2H'], points: 2 },
        { kind: 'BLACK_TWO', cards: ['2S'], points: 1 },
        { kind: 'FOUR_OF_A_KIND', cards: cards('9S 9C 9D 9H'), points: 4 },
      ]),
    ).toEqual([
      { label: 'Thúi đôi heo', cards: ['2S', '2H'], points: 3, twos: true },
      { label: 'Thối tứ quý', cards: cards('9S 9C 9D 9H'), points: 4, twos: false },
    ]);
  });

  it('names a single 2 and returns nothing without penalties', () => {
    expect(summarizePenalties([{ kind: 'BLACK_TWO', cards: ['2C'], points: 1 }])[0]!.label).toBe(
      'Thúi heo',
    );
    expect(summarizePenalties([])).toEqual([]);
  });
});
