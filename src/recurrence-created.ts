import type { CalendarTask } from "./types";

export interface PendingRecurrenceCreation {
  description: string;
  existingRaw: Set<string>;
  path: string;
  recurrence: string;
}

export function capturePendingRecurrence(
  completedTask: CalendarTask,
  tasks: CalendarTask[],
): PendingRecurrenceCreation | null {
  if (!completedTask.recurrence) return null;

  return {
    description: completedTask.description,
    existingRaw: new Set(tasks.filter((task) => matchesRecurrence(task, completedTask)).map((task) => task.raw)),
    path: completedTask.path,
    recurrence: completedTask.recurrence,
  };
}

export function findCreatedRecurrence(tasks: CalendarTask[], pending: PendingRecurrenceCreation): CalendarTask | null {
  return (
    tasks.find(
      (task) =>
        !task.completed &&
        task.path === pending.path &&
        task.description === pending.description &&
        task.recurrence === pending.recurrence &&
        !pending.existingRaw.has(task.raw),
    ) ?? null
  );
}

function matchesRecurrence(task: CalendarTask, completedTask: CalendarTask): boolean {
  return (
    task.path === completedTask.path &&
    task.description === completedTask.description &&
    task.recurrence === completedTask.recurrence
  );
}
