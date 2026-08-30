import * as chrono from "chrono-node";
import { format, isSameDay, isValid, parseISO, subDays } from "date-fns";
import { RRule } from "rrule";
import type { CalendarTask } from "../types";

export type TaskPriority = CalendarTask["priority"];

export interface TaskEditorModel {
  prefix: string;
  status: string;
  description: string;
  priority: TaskPriority;
  recurrence: string;
  due: string;
  done: string;
  completionTime: string;
  preservedMetadata: string[];
  blockLink: string;
  trailingWhitespace: string;
  hasOtherRecurrenceDate: boolean;
}

export interface DateParseResult {
  dateKey: string | null;
  error: string | null;
}

export interface RecurrenceValidation {
  normalized: string | null;
  error: string | null;
}

const TASK_LINE_PATTERN = /^([\s\t>]*(?:[-*+]|\d+[.)])\s+)\[(.)\]\s*(.*?)(\s*)$/u;
const DUE_PATTERN = /(?:^|\s)📅\s*(\d{4}-\d{2}-\d{2})(?=\s|$)/u;
const DONE_PATTERN = /(?:^|\s)✅\s*(\d{4}-\d{2}-\d{2})(?=\s|$)/u;
const COMPLETION_TIME_PATTERN = /(?:^|\s)🕒\s*(\d{2}:\d{2})(?=\s|$)/u;
const RECURRENCE_PATTERN = /(?:^|\s)🔁\s*([^🛫⏳📅➕✅❌🏁]+?)(?=\s+(?:🛫|⏳|📅|➕|✅|❌|🏁|🆔|⛔)|\s+\^[\w-]+$|$)/u;
const PRIORITY_MARKERS: Record<TaskPriority, string> = {
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  normal: "",
  low: "🔽",
  lowest: "⏬",
};
const PRESERVED_METADATA_PATTERN =
  /(?:🛫|⏳|➕|❌)\s*\d{4}-\d{2}-\d{2}|🏁\s*(?:keep|delete)|🆔\s*[^\s]+|⛔\s*[^\s]+/giu;
const PRIORITY_PATTERN = /(?:^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu;

export function taskEditorModelFromLine(raw: string): TaskEditorModel {
  const match = raw.match(TASK_LINE_PATTERN);
  if (!match) throw new Error("The selected line is not a task.");

  const body = match[3];
  const due = body.match(DUE_PATTERN)?.[1] ?? "";
  const done = body.match(DONE_PATTERN)?.[1] ?? "";
  const completionTime = body.match(COMPLETION_TIME_PATTERN)?.[1] ?? "";
  const recurrence = body.match(RECURRENCE_PATTERN)?.[1].trim() ?? "";
  const blockLinkMatch = body.match(/(?:^|\s)(\^[\w-]+)$/u);
  const blockLink = blockLinkMatch?.[1] ?? "";
  const preservedMetadata = Array.from(body.matchAll(PRESERVED_METADATA_PATTERN), (metadata) => metadata[0].trim());
  const description = body
    .replace(DUE_PATTERN, " ")
    .replace(DONE_PATTERN, " ")
    .replace(COMPLETION_TIME_PATTERN, " ")
    .replace(RECURRENCE_PATTERN, " ")
    .replace(PRIORITY_PATTERN, " ")
    .replace(PRESERVED_METADATA_PATTERN, " ")
    .replace(/(?:^|\s)\^[\w-]+$/u, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    prefix: match[1],
    status: match[2],
    description,
    priority: priorityFromBody(body),
    recurrence,
    due,
    done,
    completionTime,
    preservedMetadata,
    blockLink,
    trailingWhitespace: match[4],
    hasOtherRecurrenceDate: /(?:🛫|⏳)\s*\d{4}-\d{2}-\d{2}/u.test(body),
  };
}

export function taskLineFromEditorModel(model: TaskEditorModel): string {
  const parts = [
    model.description.trim().replace(/[\r\n]+/gu, " "),
    model.completionTime ? `🕒 ${model.completionTime}` : "",
    PRIORITY_MARKERS[model.priority],
    model.recurrence.trim() ? `🔁 ${model.recurrence.trim()}` : "",
    model.due ? `📅 ${model.due}` : "",
    model.done ? `✅ ${model.done}` : "",
    ...model.preservedMetadata,
    model.blockLink,
  ].filter(Boolean);
  return `${model.prefix}[${model.status}] ${parts.join(" ")}${model.trailingWhitespace}`;
}

export function parseTaskDate(input: string, forwardOnly: boolean, referenceDate = new Date()): DateParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { dateKey: null, error: null };

  const isoDate = parseISO(trimmed);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed) && isValid(isoDate) && format(isoDate, "yyyy-MM-dd") === trimmed) {
    return { dateKey: trimmed, error: null };
  }

  const parsed = chrono.parseDate(trimmed, referenceDate, { forwardDate: forwardOnly });
  if (!parsed || !isValid(parsed)) return { dateKey: null, error: "Enter a date such as “thu” or choose one." };
  return { dateKey: format(parsed, "yyyy-MM-dd"), error: null };
}

export function completionDateLabel(done: string, referenceDate = new Date()): string {
  const parsed = parseISO(done);
  if (!isValid(parsed)) return done;
  if (isSameDay(parsed, referenceDate)) return `${done} (today)`;
  if (isSameDay(parsed, subDays(referenceDate, 1))) return `${done} (yesterday)`;
  return done;
}

export function validateRecurrence(ruleText: string, hasDateAnchor: boolean): RecurrenceValidation {
  const trimmed = ruleText.trim();
  if (!trimmed) return { normalized: null, error: null };

  const match = trimmed.match(/^([a-zA-Z0-9, !]+?)( when done)?$/iu);
  if (!match) return { normalized: null, error: "Invalid recurrence rule." };

  try {
    const options = RRule.parseText(match[1].trim());
    const normalized = `${new RRule(options).toText()}${match[2] ? " when done" : ""}`;
    if (!hasDateAnchor) {
      return { normalized, error: "A due, scheduled, or start date is required for recurrence." };
    }
    return { normalized, error: null };
  } catch {
    return { normalized: null, error: "Invalid recurrence rule." };
  }
}

function priorityFromBody(body: string): TaskPriority {
  if (body.includes("🔺")) return "highest";
  if (body.includes("⏫")) return "high";
  if (body.includes("🔼")) return "medium";
  if (body.includes("🔽")) return "low";
  if (body.includes("⏬")) return "lowest";
  return "normal";
}
