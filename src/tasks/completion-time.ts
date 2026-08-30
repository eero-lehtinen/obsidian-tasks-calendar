import { parseTaskLine } from "./parser";

const COMPLETION_TIME_PATTERN = /\s*🕒\s*\d{2}:\d{2}/u;
const COMPLETION_TIME_MARKER = /\s*🕒\s*\d{2}:\d{2}/gu;
const DONE_DATE_MARKER = /\s+✅\s*\d{4}-\d{2}-\d{2}/u;

export function addCompletionTime(line: string, completionTime = currentLocalTime()): string {
  if (COMPLETION_TIME_PATTERN.test(line)) return line;
  const doneDate = line.match(DONE_DATE_MARKER);
  if (doneDate?.index !== undefined) {
    const doneDateEnd = doneDate.index + doneDate[0].length;
    return `${line.slice(0, doneDateEnd)} 🕒 ${completionTime}${line.slice(doneDateEnd)}`;
  }
  const blockLink = line.match(/(\s+\^[a-zA-Z0-9-]+)(\s*)$/u);
  if (blockLink?.index === undefined) return `${line} 🕒 ${completionTime}`;
  return `${line.slice(0, blockLink.index)} 🕒 ${completionTime}${blockLink[1]}${blockLink[2]}`;
}

export function addCompletionTimeToCompletedLine(replacement: string, completionTime?: string): string {
  const lines = replacement.split("\n");
  const completedLine = lines.findIndex(
    (line, lineNumber) =>
      /✅\s*\d{4}-\d{2}-\d{2}/u.test(line) || parseTaskLine(line, "", lineNumber)?.completed === true,
  );
  if (completedLine !== -1) lines[completedLine] = addCompletionTime(lines[completedLine], completionTime);
  return lines.join("\n");
}

export function currentLocalTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function removeCompletionTime(line: string): string {
  return line.replace(COMPLETION_TIME_MARKER, "");
}
