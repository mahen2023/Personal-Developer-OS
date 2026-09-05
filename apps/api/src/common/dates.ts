/**
 * Whole days between today and a date, counted the way a person counts them:
 * midnights crossed, not elapsed hours.
 *
 * Subtracting timestamps is the obvious way to write this and is subtly wrong.
 * A certificate set to expire "in three days" is stored at midnight, so at any
 * time after midnight the difference is 2.x days — which floors to 2 and ceils
 * to 3 depending on which the caller reached for. This application had all
 * three answers in different files, and the dashboard, the detail page and the
 * nightly scan disagreed about the same certificate.
 *
 * Comparing days removes it: due today is 0, tomorrow is 1, three days ago is
 * -3, and `round` absorbs the 23- and 25-hour days daylight saving creates.
 *
 * Days are the server's local ones. A user in a distant timezone can see a
 * count that is a day out around midnight; the alternative is storing every
 * user's timezone into every comparison, for a number that is only ever read
 * as "soon" or "not soon".
 */
export function daysUntil(when: Date | string): number {
  const target = when instanceof Date ? when : new Date(when);
  return Math.round((midnight(target) - midnight(new Date())) / 86_400_000);
}

const midnight = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
