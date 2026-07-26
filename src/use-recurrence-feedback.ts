import { useCallback, useEffect, useRef, useState } from "react";
import { calendarTaskDate } from "./calendar-model";
import { RECURRENCE_CREATED_FEEDBACK_DURATION_MS } from "./completion-feedback";
import { toDateKey } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import { recurrenceDateKeys } from "./recurrence";
import type { PendingRecurrenceCreation } from "./recurrence-created";
import { capturePendingRecurrence, findCreatedRecurrence } from "./recurrence-created";
import { taskVisualKey } from "./task-visual-key";
import type { CalendarTask } from "./types";

export function useRecurrenceFeedback({
  days,
  plugin,
  tasks,
  today,
}: {
  days: Date[];
  plugin: TasksCalendarPlugin;
  tasks: CalendarTask[];
  today: string;
}) {
  const [highlightedTasks, setHighlightedTasks] = useState<Set<string>>(() => new Set());
  const [highlightedDays, setHighlightedDays] = useState<Set<string>>(() => new Set());
  const [previewDays, setPreviewDays] = useState<Set<string>>(() => new Set());
  const pendingRecurrences = useRef<PendingRecurrenceCreation[]>([]);

  useEffect(() => {
    const unresolved: PendingRecurrenceCreation[] = [];
    const createdTaskKeys: string[] = [];
    const createdDayKeys: string[] = [];
    for (const pending of pendingRecurrences.current) {
      const created = findCreatedRecurrence(tasks, pending);
      if (created) {
        createdTaskKeys.push(taskVisualKey(created));
        const date = calendarTaskDate(created, plugin.settings, today);
        if (date) createdDayKeys.push(date);
      } else unresolved.push(pending);
    }
    pendingRecurrences.current = unresolved;

    if (createdTaskKeys.length === 0) return;
    setHighlightedTasks((current) => new Set([...current, ...createdTaskKeys]));
    setHighlightedDays((current) => new Set([...current, ...createdDayKeys]));
    window.setTimeout(() => {
      setHighlightedTasks((current) => withoutKeys(current, createdTaskKeys));
      setHighlightedDays((current) => withoutKeys(current, createdDayKeys));
    }, RECURRENCE_CREATED_FEEDBACK_DURATION_MS);
  }, [plugin.settings, tasks, today]);

  const expectRecurringTask = useCallback(
    (task: CalendarTask) => {
      const pending = capturePendingRecurrence(task, tasks);
      if (pending) pendingRecurrences.current.push(pending);
    },
    [tasks],
  );

  const previewRecurrence = useCallback(
    (task: CalendarTask | null) => {
      if (!task?.recurrence || days.length === 0) {
        setPreviewDays(new Set());
        return;
      }
      const baseDate = calendarTaskDate(task, plugin.settings, today);
      if (!baseDate) return;
      setPreviewDays(
        recurrenceDateKeys(task.recurrence, baseDate, toDateKey(days[0]), toDateKey(days[days.length - 1])),
      );
    },
    [days, plugin.settings, today],
  );

  return { expectRecurringTask, highlightedDays, highlightedTasks, previewDays, previewRecurrence };
}

function withoutKeys(current: Set<string>, keys: string[]): Set<string> {
  const next = new Set(current);
  for (const key of keys) next.delete(key);
  return next;
}
