import {
  addDays as addDateDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  getISOWeek,
  lightFormat,
  max,
  parseISO,
  startOfWeek as startDateWeek,
  startOfMonth,
} from "date-fns";
import type { CalendarMode } from "../types";

export function toDateKey(date: Date): string {
  return lightFormat(date, "yyyy-MM-dd");
}

export function fromDateKey(value: string): Date {
  return parseISO(value);
}

export function addDays(date: Date, amount: number): Date {
  return addDateDays(date, amount);
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  return startDateWeek(date, { weekStartsOn });
}

export function calendarDays(anchor: Date, mode: CalendarMode, weekStartsOn: 0 | 1): Date[] {
  if (mode === "day") return [anchor];

  if (mode === "week") {
    const start = startOfWeek(anchor, weekStartsOn);
    return eachDayOfInterval({ start, end: addDateDays(start, 6) });
  }

  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const naturalGridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn });
  const gridEnd = max([naturalGridEnd, addDateDays(gridStart, 34)]);
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function moveAnchor(anchor: Date, mode: CalendarMode, direction: -1 | 1): Date {
  if (mode === "day") return addDays(anchor, direction);

  if (mode === "week") {
    return addDays(anchor, direction * 7);
  }
  return addMonths(startOfMonth(anchor), direction);
}

export function isoWeekNumber(date: Date): number {
  return getISOWeek(date);
}

export function titleForRange(anchor: Date, mode: CalendarMode, weekStartsOn: 0 | 1, locale?: string): string {
  if (mode === "day") {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(anchor);
  }

  if (mode === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor);
  }
  const start = startOfWeek(anchor, weekStartsOn);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(start);
  const endText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);
  return `${startText} – ${endText}`;
}
