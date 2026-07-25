import type { CalendarTask } from "./types";

export function taskVisualKey(task: CalendarTask): string {
  const blockId = task.raw.match(/\s\^([\w-]+)$/u)?.[1];
  if (blockId) return JSON.stringify([task.path, blockId]);

  return JSON.stringify([
    task.path,
    task.description,
    task.scheduled,
    task.due,
    task.start,
    task.created,
    task.recurrence,
  ]);
}
