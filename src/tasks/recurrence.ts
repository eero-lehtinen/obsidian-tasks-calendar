import { RRule } from "rrule";
import { fromDateKey, toDateKey } from "../calendar/date-utils";

export function recurrenceDateKeys(
  ruleText: string,
  baseDateKey: string,
  rangeStartKey: string,
  rangeEndKey: string,
): Set<string> {
  try {
    const isolatedRule = ruleText.replace(/\s+when done$/i, "").trim();
    const options = RRule.parseText(isolatedRule);
    options.dtstart = toUtcDate(baseDateKey);
    const rule = new RRule(options);
    const occurrences = rule.between(toUtcDate(rangeStartKey), endOfUtcDate(rangeEndKey), true);
    return new Set(occurrences.map(toUtcDateKey));
  } catch {
    return new Set();
  }
}

function toUtcDate(dateKey: string): Date {
  const date = fromDateKey(dateKey);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function endOfUtcDate(dateKey: string): Date {
  const date = toUtcDate(dateKey);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function toUtcDateKey(date: Date): string {
  return toDateKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
