// Date helpers. Every function takes the date it works from: nothing in the
// engine reads the clock except the CLI, which passes `today` and `now` in,
// so tests and dry runs are deterministic.

/** YYYY-MM-DD of a Date in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DDTHH:MM:SSZ of a Date. */
export function isoStamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Parse YYYY-MM-DD as a UTC midnight Date. */
export function parseIsoDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Not an ISO date: "${s}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function addDays(date: string, days: number): string {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = parseIsoDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isBusinessDay(date: string, holidays: readonly string[] = []): boolean {
  return isoWeekday(date) <= 5 && !holidays.includes(date);
}

/** The date `n` business days after `date` (n >= 0; n = 0 returns the next business day on or after date). */
export function addBusinessDays(date: string, n: number, holidays: readonly string[] = []): string {
  let d = date;
  while (!isBusinessDay(d, holidays)) d = addDays(d, 1);
  for (let i = 0; i < n; i++) {
    d = addDays(d, 1);
    while (!isBusinessDay(d, holidays)) d = addDays(d, 1);
  }
  return d;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86_400_000);
}

/** Whole years from an ISO date to `today`, or undefined when the date is blank. */
export function yearsSince(date: string | undefined, today: string): number | undefined {
  if (!date) return undefined;
  const a = parseIsoDate(date);
  const b = parseIsoDate(today);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years--;
  return years;
}

/** ISO week label, e.g. "2026-W43", for weekly reports. */
export function isoWeekLabel(date: string): string {
  const d = parseIsoDate(date);
  const day = isoWeekday(date);
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Local wall-clock HH:MM of an instant in an IANA time zone. */
export function localTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** Local YYYY-MM-DD of an instant in an IANA time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * US federal holidays (observed) for a year, plus the day after
 * Thanksgiving: the default no-send list. Add the year-end lull in config.
 */
export function usFederalHolidays(year: number): string[] {
  const d = (m: number, day: number) => isoDate(new Date(Date.UTC(year, m - 1, day)));
  const nth = (m: number, weekday: number, n: number) => {
    // weekday: 1 = Monday ... 7 = Sunday; n = 1..4, or -1 for the last
    if (n > 0) {
      let date = d(m, 1);
      while (isoWeekday(date) !== weekday) date = addDays(date, 1);
      return addDays(date, 7 * (n - 1));
    }
    let date = isoDate(new Date(Date.UTC(year, m, 0)));
    while (isoWeekday(date) !== weekday) date = addDays(date, -1);
    return date;
  };
  const observed = (date: string) => (isoWeekday(date) === 6 ? addDays(date, -1) : isoWeekday(date) === 7 ? addDays(date, 1) : date);
  const thanksgiving = nth(11, 4, 4);
  return [
    observed(d(1, 1)),
    nth(1, 1, 3), // Martin Luther King Jr. Day
    nth(2, 1, 3), // Washington's Birthday
    nth(5, 1, -1), // Memorial Day
    observed(d(6, 19)),
    observed(d(7, 4)),
    nth(9, 1, 1), // Labor Day
    nth(10, 1, 2), // Columbus Day
    observed(d(11, 11)),
    thanksgiving,
    addDays(thanksgiving, 1),
    observed(d(12, 25)),
  ];
}
