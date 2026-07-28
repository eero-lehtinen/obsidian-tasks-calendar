import type { CalendarTask } from "../types";

export interface CompletionOverride {
  completed: boolean;
  raw: string;
}

export function applyCompletionOverrides(
  tasks: CalendarTask[],
  overrides: ReadonlyMap<string, CompletionOverride>,
): CalendarTask[] {
  return tasks.map((task) => {
    const override = overrides.get(task.id);
    return override ? { ...task, completed: override.completed } : task;
  });
}

export function reconcileCompletionOverrides(
  tasks: CalendarTask[],
  overrides: ReadonlyMap<string, CompletionOverride>,
): Map<string, CompletionOverride> {
  const sourceTasks = new Map(tasks.map((task) => [task.id, task]));
  const next = new Map(overrides);

  for (const [taskId, override] of overrides) {
    const source = sourceTasks.get(taskId);
    if (!source || source.raw !== override.raw) next.delete(taskId);
  }

  return next;
}
