/**
 * A `YYYY-MM-DD` string this many days from today, in **local** time.
 *
 * `toISOString().slice(0, 10)` is the obvious way to write this and is wrong:
 * it gives the UTC date, while both the date input and the server's expiry
 * arithmetic count calendar days locally. The two disagree for the hours
 * between the UTC day rolling over and the local one — so a suite that used
 * it passed all day and failed at night, off by exactly one day.
 */
export function inDays(days: number): string {
  const when = new Date(Date.now() + days * 86_400_000);
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const day = String(when.getDate()).padStart(2, '0');
  return `${when.getFullYear()}-${month}-${day}`;
}
