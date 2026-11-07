/**
 * Date display with Western digits in both languages. Pure: does not depend on Intl or the
 * device locale (which could switch to Arabic-Indic digits). Local time.
 */
import type { Strings } from "./strings";

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 14:05" · "Yesterday, 09:30" · "7 Nov, 14:05" · "7 Nov 2025". Empty for invalid input. */
export function formatWhen(value: string | number | Date, strings: Strings, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { date } = strings;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, now)) return `${date.today}${date.separator}${time}`;
  if (sameDay(d, yesterday)) return `${date.yesterday}${date.separator}${time}`;
  const dayMonth = `${d.getDate()} ${date.months[d.getMonth()]}`;
  if (d.getFullYear() === now.getFullYear()) return `${dayMonth}${date.separator}${time}`;
  return `${dayMonth} ${d.getFullYear()}`;
}
