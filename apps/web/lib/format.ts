const coinFormatter = new Intl.NumberFormat('vi-VN');
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

/** 1250 → "1.250" (Vietnamese grouping). Coins are integers; never formatted as currency. */
export function formatCoins(amount: number): string {
  return coinFormatter.format(amount);
}

/** +300 / −100 with an explicit sign, for ledger-style deltas. */
export function formatCoinDelta(amount: number): string {
  if (amount === 0) return '0';
  return `${amount > 0 ? '+' : '−'}${coinFormatter.format(Math.abs(amount))}`;
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Date and time in Vietnam time, e.g. for ledger entries. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** "5 phút trước", "hôm qua" … relative to `now` (passed in to keep rendering pure). */
export function formatRelativeTime(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormatter.format(seconds, 'second');
  if (abs < 3600) return relativeFormatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFormatter.format(Math.round(seconds / 3600), 'hour');
  return relativeFormatter.format(Math.round(seconds / 86_400), 'day');
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/** Short, non-sensitive display form of a UUID user ID. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
