import { cardLabelVi, COMBINATION_LABELS_VI, type TimelineEvent } from '@tienlen/shared';

/** One line of a match's public timeline, in Vietnamese. */
export function describeEvent(event: TimelineEvent, name: (seat: number | null) => string): string {
  switch (event.type) {
    case 'PLAY': {
      const cards = (event.cards ?? []).map(cardLabelVi).join(', ');
      const kind = event.combinationType ? COMBINATION_LABELS_VI[event.combinationType] : '';
      const chop =
        event.choppedSeat === null
          ? ''
          : ` — ${event.outOfTurn ? 'chặt ngang' : 'chặt'} ${name(event.choppedSeat)}`;
      return `${name(event.seatIndex)} đánh ${kind.toLowerCase()}: ${cards}${chop}`;
    }
    case 'PASS':
      return `${name(event.seatIndex)} bỏ lượt`;
    case 'TURN_TIMEOUT':
      return `${name(event.seatIndex)} hết giờ, máy tự đi thay`;
    case 'TRICK_RESOLVED':
      return `${name(event.seatIndex)} thắng vòng`;
    case 'PLAYER_FINISHED':
      return `${name(event.seatIndex)} hết bài, về hạng ${event.place}`;
    case 'MATCH_FINISHED':
      return `Ván kết thúc — ${name(event.seatIndex)} về nhất`;
    case 'MATCH_ABORTED':
      return 'Ván đấu bị hủy, phí vào bàn được hoàn lại';
    case 'PLAYER_DISCONNECTED':
      return `${name(event.seatIndex)} mất kết nối (máy tự đi thay khi hết giờ)`;
    case 'PLAYER_RECONNECTED':
      return `${name(event.seatIndex)} đã kết nối lại`;
  }
}
