import { toDateKey } from "./date-utils";
import type { CalendarTask, QueryResult } from "./types";

type Predicate = (task: CalendarTask) => boolean;

export function compileQuery(source: string, now = new Date()): QueryResult {
  const predicates: Predicate[] = [];
  const today = toDateKey(now);
  const tomorrow = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

  for (const line of lines) {
    const parsed = parseExpression(line, today, tomorrow);
    if (typeof parsed === "string") return { predicate: () => false, error: parsed };
    if (parsed) predicates.push(parsed);
  }

  return {
    predicate: (task) => predicates.every((predicate) => predicate(task)),
    error: null
  };
}

function parseExpression(source: string, today: string, tomorrow: string): Predicate | null | string {
  const line = stripOuterParentheses(source.trim());
  for (const operator of ["OR", "AND"] as const) {
    const parts = splitAtTopLevel(line, operator);
    if (parts.length > 1) {
      const predicates: Predicate[] = [];
      for (const part of parts) {
        const parsed = parseExpression(part, today, tomorrow);
        if (typeof parsed === "string") return parsed;
        if (parsed) predicates.push(parsed);
      }
      return operator === "OR"
        ? (task) => predicates.some((predicate) => predicate(task))
        : (task) => predicates.every((predicate) => predicate(task));
    }
  }

  const notMatch = line.match(/^NOT\s+(.+)$/i);
  if (notMatch) {
    const parsed = parseExpression(notMatch[1], today, tomorrow);
    if (typeof parsed === "string" || parsed === null) return parsed;
    return (task) => !parsed(task);
  }
  return parseInstruction(line, today, tomorrow);
}

function parseInstruction(line: string, today: string, tomorrow: string): Predicate | null | string {
  const normalized = line.toLowerCase();
  if (normalized === "done") return (task) => task.completed;
  if (normalized === "not done") return (task) => !task.completed;
  if (normalized === "is recurring" || normalized === "recurring") return (task) => task.recurrence !== null;
  if (normalized === "is not recurring" || normalized === "not recurring") return (task) => task.recurrence === null;
  if (normalized === "has tags") return (task) => task.tags.length > 0;
  if (normalized === "no tags") return (task) => task.tags.length === 0;

  const textMatch = line.match(/^(description|path|folder|tag) (includes|does not include) (.+)$/i);
  if (textMatch) {
    const [, field, operator, needleRaw] = textMatch;
    const needle = needleRaw.toLowerCase();
    return (task) => {
      let haystack = "";
      if (field.toLowerCase() === "description") haystack = task.description;
      if (field.toLowerCase() === "path") haystack = task.path;
      if (field.toLowerCase() === "folder") haystack = task.path.split("/").slice(0, -1).join("/");
      if (field.toLowerCase() === "tag") haystack = task.tags.join(" ");
      const included = haystack.toLowerCase().includes(needle);
      return operator.toLowerCase() === "includes" ? included : !included;
    };
  }

  const priorityMatch = normalized.match(/^priority is (highest|high|medium|normal|low|lowest)$/);
  if (priorityMatch) {
    const requested = priorityMatch[1] === "medium" ? "normal" : priorityMatch[1];
    return (task) => task.priority === requested;
  }

  const dateMatch = normalized.match(/^(due|scheduled|start|happens) (on |before |after )?(.+)$/);
  if (dateMatch) {
    const [, field, operatorRaw = "on ", valueRaw] = dateMatch;
    const value = resolveDate(valueRaw.trim(), today, tomorrow);
    if (!value) return `Unsupported date in query: "${line}"`;
    const operator = operatorRaw.trim();
    return (task) => {
      const values = field === "happens" ? [task.start, task.scheduled, task.due] : [task[field as "due" | "scheduled" | "start"]];
      return values.some((candidate) => {
        if (!candidate) return false;
        if (operator === "before") return candidate < value;
        if (operator === "after") return candidate > value;
        return candidate === value;
      });
    };
  }

  if (/^(sort|group|limit|hide|show|short mode|explain|ignore global query|preset)\b/i.test(line)) return null;
  return `Unsupported filter: "${line}"`;
}

function stripOuterParentheses(source: string): string {
  let result = source;
  while (result.startsWith("(") && result.endsWith(")") && enclosesWholeExpression(result)) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function enclosesWholeExpression(source: string): boolean {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0 && index < source.length - 1) return false;
  }
  return depth === 0;
}

function splitAtTopLevel(source: string, operator: "AND" | "OR"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const marker = ` ${operator} `;
  const upper = source.toUpperCase();
  for (let index = 0; index <= source.length - marker.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0 && upper.slice(index, index + marker.length) === marker) {
      parts.push(source.slice(start, index).trim());
      start = index + marker.length;
      index += marker.length - 1;
    }
  }
  if (parts.length > 0) parts.push(source.slice(start).trim());
  return parts;
}

function resolveDate(value: string, today: string, tomorrow: string): string | null {
  if (value === "today") return today;
  if (value === "tomorrow") return tomorrow;
  if (value === "yesterday") {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return toDateKey(date);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
