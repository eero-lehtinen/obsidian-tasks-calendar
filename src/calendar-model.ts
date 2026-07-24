import { calendarDays, toDateKey } from "./date-utils";
import { compileQuery } from "./query";
import { compareCalendarTasks } from "./task-sort";
import type { CalendarState, CalendarTask, TasksCalendarSettings } from "./types";

export interface CalendarModel {
  days: Date[];
  lateTasks: CalendarTask[];
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
  settings: Pick<TasksCalendarSettings, "datePreference" | "undatedTasks" | "weekStartsOn">,
  anchor: Date,
  now = new Date(),
): CalendarModel {
  const query = compileQuery(state.query);
  const days = calendarDays(anchor, state.mode, settings.weekStartsOn);
  const today = toDateKey(now);
  const todayViewStart = toDateKey(calendarDays(now, state.mode, settings.weekStartsOn)[0]);
  const visibleDateKeys = new Set(days.map(toDateKey));
  const tasksByDate = new Map<string, CalendarTask[]>();
  const lateTasks: CalendarTask[] = [];
  const search = state.search.trim().toLowerCase();
  let visibleTasks = 0;

  for (const task of tasks) {
    if ((!state.showCompleted && task.completed) || query.error || !query.predicate(task)) continue;
    if (search && !`${task.description} ${task.path} ${task.tags.join(" ")}`.toLowerCase().includes(search)) continue;

    const key = calendarTaskDate(task, settings, today);
    if (!key) continue;
    if (!task.completed && key < todayViewStart && !visibleDateKeys.has(key)) lateTasks.push(task);

    const bucket = tasksByDate.get(key) ?? [];
    bucket.push(task);
    tasksByDate.set(key, bucket);
    visibleTasks += 1;
  }

  for (const bucket of tasksByDate.values()) bucket.sort(compareCalendarTasks);
  lateTasks.sort((left, right) => {
    const leftDate = calendarTaskDate(left, settings, today) ?? "";
    const rightDate = calendarTaskDate(right, settings, today) ?? "";
    return leftDate.localeCompare(rightDate) || compareCalendarTasks(left, right);
  });

  return {
    days,
    lateTasks,
    queryError: query.error,
    tasksByDate,
    today,
    visibleTasks,
  };
}
