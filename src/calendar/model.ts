import { compareTasksInOrder, orderCalendarTasks } from "../tasks/order";
import { compileQuery } from "../tasks/query";
import type { CalendarState, CalendarTask, TasksCalendarSettings } from "../types";
import { calendarDays, toDateKey } from "./date-utils";

export interface CalendarModel {
  days: Date[];
  overdueTasks: CalendarTask[];
  queryError: string | null;
  tasksByDate: Map<string, CalendarTask[]>;
  today: string;
  visibleTasks: number;
}

export function calendarTaskDate(
  task: CalendarTask,
  settings: Pick<TasksCalendarSettings, "datePreference" | "undatedTasks">,
  today: string,
): string | null {
  for (const field of settings.datePreference) {
    const date = task[field];
    if (date) return date;
  }
  return settings.undatedTasks === "today" ? today : null;
}

export function createCalendarModel(
  tasks: CalendarTask[],
  state: CalendarState,
  settings: Pick<TasksCalendarSettings, "datePreference" | "taskOrder" | "undatedTasks" | "weekStartsOn">,
  anchor: Date,
  now = new Date(),
): CalendarModel {
  const query = compileQuery(state.query, now);
  const days = calendarDays(anchor, state.mode, settings.weekStartsOn);
  const today = toDateKey(now);
  const todayViewStart = toDateKey(calendarDays(now, state.mode, settings.weekStartsOn)[0]);
  const visibleDateKeys = new Set(days.map(toDateKey));
  const tasksByDate = new Map<string, CalendarTask[]>();
  const overdueTasks: CalendarTask[] = [];
  const search = state.search.trim().toLowerCase();
  let visibleTasks = 0;

  for (const task of tasks) {
    if ((!state.showCompleted && task.completed) || query.error || !query.predicate(task)) continue;
    if (search && !`${task.description} ${task.path} ${task.tags.join(" ")}`.toLowerCase().includes(search)) continue;

    const key = calendarTaskDate(task, settings, today);
    if (!key) continue;
    if (!task.completed && key < todayViewStart && !visibleDateKeys.has(key)) overdueTasks.push(task);

    const bucket = tasksByDate.get(key) ?? [];
    bucket.push(task);
    tasksByDate.set(key, bucket);
    visibleTasks += 1;
  }

  for (const [date, bucket] of tasksByDate) tasksByDate.set(date, orderCalendarTasks(bucket, settings.taskOrder[date]));
  overdueTasks.sort((left, right) => {
    const leftDate = calendarTaskDate(left, settings, today) ?? "";
    const rightDate = calendarTaskDate(right, settings, today) ?? "";
    return leftDate.localeCompare(rightDate) || compareTasksInOrder(left, right, settings.taskOrder[leftDate]);
  });

  return {
    days,
    overdueTasks,
    queryError: query.error,
    tasksByDate,
    today,
    visibleTasks,
  };
}
