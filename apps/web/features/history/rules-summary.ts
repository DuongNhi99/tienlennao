import { type GameRules, SUIT_SYMBOLS } from '@tienlen/shared';

export interface RuleLine {
  label: string;
  value: string;
}

const yes = (on: boolean) => (on ? 'Có' : 'Không');

/** The rules a match was played by, as label/value lines (docs/GAME_RULES.md). */
export function summarizeRules(rules: GameRules): RuleLine[] {
  const { bombs, leftoverPenalties: p } = rules;
  return [
    {
      label: 'Đi trước',
      value:
        rules.starter === 'PREVIOUS_WINNER'
          ? 'Người thắng ván trước (ván đầu: lá nhỏ nhất)'
          : 'Người giữ lá nhỏ nhất',
    },
    {
      label: 'Lượt đầu',
      value: rules.opening === 'HOLDER_MUST_PLAY_LOWEST' ? 'Phải đánh lá nhỏ nhất' : 'Đánh tự do',
    },
    {
      label: 'Kết thúc',
      value:
        rules.endCondition === 'ALL_PLACEMENTS'
          ? 'Đánh đến khi đủ thứ hạng'
          : 'Khi có người về nhất',
    },
    { label: 'Thứ tự chất', value: rules.suitOrder.map((s) => SUIT_SYMBOLS[s]).join(' < ') },
    { label: '3 đôi thông chặt heo', value: yes(bombs.threeConsecutivePairs) },
    {
      label: '3 đôi thông chặt đôi heo',
      value: yes(bombs.threeConsecutivePairs && bombs.threeConsecutivePairsBeatPairOfTwos),
    },
    { label: 'Tứ quý chặt heo, đôi heo', value: yes(bombs.fourOfAKind) },
    { label: '4 đôi thông chặt heo, đôi heo', value: yes(bombs.fourConsecutivePairs) },
    { label: 'Chặt chồng (bom chặt bom)', value: yes(bombs.bombsBeatBombs) },
    { label: 'Chặt ngang (không cần tới lượt)', value: yes(bombs.outOfTurn) },
    {
      label: 'Phạt thúi',
      value: `heo đen ${p.blackTwo}, heo đỏ ${p.redTwo}, tứ quý ${p.fourOfAKind}, 3 đôi thông ${p.threeConsecutivePairs}, 4 đôi thông ${p.fourConsecutivePairs} điểm`,
    },
  ];
}
