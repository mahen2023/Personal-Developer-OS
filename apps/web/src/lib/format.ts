/** Formatting helpers shared by the timeline, tables and status chips. */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(value: string | Date): string {
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function clockTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Day heading for the activity timeline: Today / Yesterday / 12 Aug. */
export function dayLabel(value: string | Date): string {
  const date = new Date(value);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function expiryPhrase(daysLeft: number | null): string {
  if (daysLeft === null) return 'No expiry recorded';
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Expires today';
  return `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}

/** Joins class names; falsy entries drop out. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
