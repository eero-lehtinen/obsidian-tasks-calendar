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

export function createTaskVisualKeyFactory(): (task: CalendarTask) => string {
  const occurrences = new Map<string, number>();

  return (task) => {
    const baseKey = taskVisualKey(task);
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    return JSON.stringify([baseKey, occurrence]);
  };
}
