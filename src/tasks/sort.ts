import type { CalendarTask } from "../types";

export function compareCalendarTasks(left: CalendarTask, right: CalendarTask): number {
  if (left.completed !== right.completed) return left.completed ? 1 : -1;
  const priorities = ["highest", "high", "normal", "low", "lowest"];
  const priorityOrder = priorities.indexOf(left.priority) - priorities.indexOf(right.priority);
  if (priorityOrder !== 0) return priorityOrder;

  const pathOrder = left.path.localeCompare(right.path);
  if (pathOrder !== 0) return pathOrder;
  return right.line - left.line || left.description.localeCompare(right.description);
}
