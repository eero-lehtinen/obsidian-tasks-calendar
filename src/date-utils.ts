import type { CalendarMode } from "./types";

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (result.getDay() - weekStartsOn + 7) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

export function calendarDays(anchor: Date, mode: CalendarMode, weekStartsOn: 0 | 1): Date[] {
  if (mode === "week") {
    const start = startOfWeek(anchor, weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const trailing = (weekStartsOn + 6 - monthEnd.getDay() + 7) % 7;
  const count = Math.max(35, Math.ceil((monthEnd.getDate() + ((monthStart.getDay() - weekStartsOn + 7) % 7) + trailing) / 7) * 7);
  return Array.from({ length: count }, (_, index) => addDays(gridStart, index));
}

export function moveAnchor(anchor: Date, mode: CalendarMode, direction: -1 | 1): Date {
  if (mode === "week") {
    return addDays(anchor, direction * 7);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export function isoWeekNumber(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

export function titleForRange(anchor: Date, mode: CalendarMode, weekStartsOn: 0 | 1, locale?: string): string {
  if (mode === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor);
  }
  const start = startOfWeek(anchor, weekStartsOn);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  }).format(start);
  const endText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(end);
  return `${startText} – ${endText}`;
}
