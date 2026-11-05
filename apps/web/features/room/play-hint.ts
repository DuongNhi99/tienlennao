import {
  type CardId,
  cardLabelVi,
  checkPlay,
  classifyCombination,
  type Combination,
  DEFAULT_GAME_RULES,
  describeCombination,
  type GameViolation,
  parseCard,
  type PlayerGameView,
} from '@tienlen/shared';

export interface PlayHint {
  /** Whether "Đánh" may be pressed. The server still decides. */
  canPlay: boolean;
  /** A short status line for the selection, in Vietnamese. */
  message: string;
  /** The selection would chop (chặt) the table, possibly out of turn. */
  chop: boolean;
  outOfTurn: boolean;
}

/** A combination by name, e.g. "2 cơ", "đôi K", "sảnh 5 lá đến A", "3 đôi thông". */
export function nameCombination(c: Combination): string {
  const rank = parseCard(c.top).rank;
  switch (c.type) {
    case 'SINGLE':
      return cardLabelVi(c.top);
    case 'STRAIGHT':
      return `sảnh ${c.cards.length} lá đến ${rank}`;
    case 'CONSECUTIVE_PAIRS':
      return describeCombination(c).toLowerCase();
    default:
      return `${describeCombination(c).toLowerCase()} ${rank}`;
  }
}

const REJECTED: Partial<Record<GameViolation, string>> = {
  DUPLICATE_CARDS: 'Lựa chọn không hợp lệ',
  CARDS_NOT_OWNED: 'Lựa chọn không hợp lệ',
  INVALID_COMBINATION: 'Không phải bộ hợp lệ',
};

/**
 * Judges the selected cards with the engine's own `checkPlay`, using only what this player's
 * view shows (their hand, the turn, the table, the rules). With an older API that does not send
 * the rules, only the combination's shape is checked and the server decides the rest.
 */
export function playHint(view: PlayerGameView, selected: readonly CardId[]): PlayHint {
  const me = view.seats[view.mySeat]!;
  const isMyTurn = view.turnSeat === view.mySeat;
  const rules = view.rules ?? DEFAULT_GAME_RULES;
  const none = (message: string): PlayHint => ({
    canPlay: false,
    message,
    chop: false,
    outOfTurn: false,
  });
  if (view.status !== 'PLAYING') return none('');

  const table = view.currentTrick ? classifyCombination(view.currentTrick.cards, rules) : null;
  if (selected.length === 0) {
    if (!isMyTurn) return none(me.hasPassed ? 'Bạn đã bỏ lượt vòng này' : '0 lá đã chọn');
    if (view.openingCard) return none(`Bạn đi trước: đánh bộ có ${cardLabelVi(view.openingCard)}`);
    return none(table ? `Chặn ${nameCombination(table)} hoặc bỏ lượt` : 'Bạn đi trước');
  }

  const combination = classifyCombination(selected, rules);
  const shape = combination
    ? `${describeCombination(combination)} · ${selected.length} lá`
    : 'Không phải bộ hợp lệ';
  if (view.rules === null) {
    return { ...none(shape), canPlay: isMyTurn && combination !== null };
  }

  const check = checkPlay(
    {
      rules,
      seat: view.mySeat,
      hand: view.myHand,
      turnSeat: view.turnSeat,
      table:
        view.currentTrick && table
          ? { seat: view.currentTrick.seatIndex, combination: table }
          : null,
      openingCard: view.openingCard,
      active: me.finishedPlace === null,
    },
    selected,
  );
  if (check.ok) {
    const suffix = check.outOfTurn ? ' — chặt ngang!' : check.chop ? ' — chặt!' : '';
    return {
      canPlay: true,
      message: `${shape}${suffix}`,
      chop: check.chop,
      outOfTurn: check.outOfTurn,
    };
  }
  switch (check.violation) {
    case 'NOT_YOUR_TURN':
      return none(combination ? `${shape} · chưa tới lượt bạn` : shape);
    case 'MUST_PLAY_OPENING_CARD':
      return none(`Lượt đầu phải có ${cardLabelVi(view.openingCard!)}`);
    case 'CANNOT_BEAT':
      return none(`${shape} · không chặn được ${nameCombination(table!)}`);
    default:
      return none(REJECTED[check.violation] ?? 'Không thể đánh lúc này');
  }
}
