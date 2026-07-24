import type { CalendarTask, DateField } from "./types";

const TASK_PATTERN = /^([\s\t>]*)((?:[-*+]|\d+[.)]))\s+\[(.)\]\s*(.*)$/u;
const DATE_MARKERS: Record<string, keyof Pick<CalendarTask, "scheduled" | "due" | "start" | "created" | "done" | "cancelled">> = {
  "⏳": "scheduled",
  "📅": "due",
  "🛫": "start",
  "➕": "created",
  "✅": "done",
  "❌": "cancelled"
};
const COMPLETED_STATUSES = new Set(["x", "X", "-", "_"]);

export function parseTaskLine(raw: string, path: string, line: number): CalendarTask | null {
  const match = raw.match(TASK_PATTERN);
  if (!match) return null;

  const status = match[3];
  const body = match[4].trim();
  const dates: Record<keyof Pick<CalendarTask, "scheduled" | "due" | "start" | "created" | "done" | "cancelled">, string | null> = {
    scheduled: null,
    due: null,
    start: null,
    created: null,
    done: null,
    cancelled: null
  };

  for (const [marker, field] of Object.entries(DATE_MARKERS)) {
    const dateMatch = body.match(new RegExp(`${marker}\\s*(\\d{4}-\\d{2}-\\d{2})`, "u"));
    dates[field] = dateMatch?.[1] ?? null;
  }

  const recurrenceMatch = body.match(/🔁\s*([^🛫⏳📅➕✅❌🏁]+?)(?=\s+(?:🛫|⏳|📅|➕|✅|❌|🏁)|\s+\^[\w-]+$|$)/u);
  const tags = Array.from(body.matchAll(/(^|\s)(#[^ !@#$%^&*(),.?":{}|<>]+)/gu), (tag) => tag[2]);
  const description = body
    .replace(/(?:🛫|⏳|📅|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/🔁\s*([^🛫⏳📅➕✅❌🏁]+?)(?=\s+(?:🛫|⏳|📅|➕|✅|❌|🏁)|\s+\^[\w-]+$|$)/gu, "")
    .replace(/\s+\^[\w-]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: `${path}:${line}`,
    path,
    line,
    raw,
    description,
    status,
    completed: COMPLETED_STATUSES.has(status),
    tags,
    priority: parsePriority(body),
    scheduled: dates.scheduled,
    due: dates.due,
    start: dates.start,
    created: dates.created,
    done: dates.done,
    cancelled: dates.cancelled,
    recurrence: recurrenceMatch?.[1].trim() ?? null
  };
}

function parsePriority(body: string): CalendarTask["priority"] {
  if (body.includes("🔺")) return "highest";
  if (body.includes("⏫")) return "high";
  if (body.includes("🔼")) return "normal";
  if (body.includes("🔽")) return "low";
  if (body.includes("⏬")) return "lowest";
  return "normal";
}

export function fallbackToggleLine(raw: string): string {
  return raw.replace(/^([\s\t>]*(?:[-*+]|\d+[.)])\s+)\[(.)\]/u, (_full, prefix: string, status: string) => {
    return `${prefix}[${COMPLETED_STATUSES.has(status) ? " " : "x"}]`;
  });
}

export function rescheduleTaskLine(raw: string, field: DateField, date: string): string {
  const marker = Object.entries(DATE_MARKERS).find(([, candidate]) => candidate === field)?.[0];
  if (!marker) return raw;

  const existingDate = new RegExp(`${marker}\\s*\\d{4}-\\d{2}-\\d{2}`, "u");
  if (existingDate.test(raw)) return raw.replace(existingDate, `${marker} ${date}`);

  const blockLink = raw.match(/(\s+\^[a-zA-Z0-9-]+)(\s*)$/u);
  if (blockLink?.index !== undefined) {
    return `${raw.slice(0, blockLink.index)} ${marker} ${date}${blockLink[1]}${blockLink[2]}`;
  }

  const trailingWhitespace = raw.match(/\s*$/u)?.[0] ?? "";
  return `${raw.slice(0, raw.length - trailingWhitespace.length)} ${marker} ${date}${trailingWhitespace}`;
}
