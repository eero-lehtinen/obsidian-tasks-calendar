import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements } from "@dnd-kit/core";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, Ref } from "react";
import { createPortal } from "react-dom";
import { CalendarGrid } from "./calendar-grid";
import { calendarTaskDate, createCalendarModel } from "./calendar-model";
import { CalendarToolbar, QueryEditor } from "./calendar-toolbar";
import { applyCompletionOverrides, reconcileCompletionOverrides } from "./completion-overrides";
import type { CompletionOverride } from "./completion-overrides";
import { fromDateKey, moveAnchor, toDateKey } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import { TaskCard } from "./task-card";
import { createTaskVisualKeyFactory, taskVisualKey } from "./task-visual-key";
import type { CalendarState, CalendarTask } from "./types";
import { useCalendarLayout } from "./use-calendar-layout";
import { useRecurrenceFeedback } from "./use-recurrence-feedback";

export interface CalendarHandle {
  getState(): CalendarState;
  refresh(): void;
  setState(state: Partial<CalendarState>): void;
}

interface CalendarAppProps {
  constrainHeightToContainer: boolean;
  initial: CalendarState;
  instanceId: number;
  onStateChange?: (state: CalendarState) => void;
  plugin: TasksCalendarPlugin;
}

const SELECTION_DISPLAY_DURATION_MS = 1_200;

const dragAnnouncements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${dragTaskName(active.data.current?.task)}.`,
  onDragOver: ({ active, over }) => {
    const date = over?.data.current?.date;
    return date
      ? `${dragTaskName(active.data.current?.task)} is over ${date}.`
      : `${dragTaskName(active.data.current?.task)} is not over a calendar day.`;
  },
  onDragEnd: ({ active, over }) => {
    const date = over?.data.current?.date;
    return date
      ? `Moved ${dragTaskName(active.data.current?.task)} to ${date}.`
      : `${dragTaskName(active.data.current?.task)} was not moved.`;
  },
  onDragCancel: ({ active }) => `Cancelled moving ${dragTaskName(active.data.current?.task)}.`,
};

export const CalendarApp = forwardRef(function CalendarApp(
  { constrainHeightToContainer, initial, instanceId, onStateChange, plugin }: CalendarAppProps,
  ref: Ref<CalendarHandle>,
) {
  const [state, setState] = useState(initial);
  const [queryOpen, setQueryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [activeTask, setActiveTask] = useState<CalendarTask | null>(null);
  const [completionOverrides, setCompletionOverrides] = useState<Map<string, CompletionOverride>>(() => new Map());
  const stateRef = useRef(state);
  const gridRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const updateState = useCallback(
    (update: Partial<CalendarState> | ((current: CalendarState) => CalendarState)) => {
      const next = typeof update === "function" ? update(stateRef.current) : { ...stateRef.current, ...update };
      stateRef.current = next;
      setState(next);
      onStateChange?.({ ...next });
    },
    [onStateChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      getState: () => ({ ...stateRef.current }),
      refresh: () => setRevision((current) => current + 1),
      setState: updateState,
    }),
    [updateState],
  );

  const renderStartedAt = performance.now();
  const anchor = useMemo(() => fromDateKey(state.anchor), [state.anchor]);
  const tasks = plugin.taskStore.getTasks();
  const displayedTasks = useMemo(
    () => applyCompletionOverrides(tasks, completionOverrides),
    [completionOverrides, tasks],
  );
  const model = useMemo(
    () => createCalendarModel(displayedTasks, state, plugin.settings, anchor),
    [anchor, displayedTasks, plugin.settings, revision, state],
  );
  const { expectRecurringTask, highlightedDays, highlightedTasks, previewDays, previewRecurrence } =
    useRecurrenceFeedback({
      days: model.days,
      plugin,
      revision,
      tasks,
      today: model.today,
    });

  useEffect(() => {
    setCompletionOverrides((current) => reconcileCompletionOverrides(tasks, current));
  }, [revision]);

  useEffect(() => {
    if (!state.selectedDate) return;
    const timeoutId = window.setTimeout(() => updateState({ selectedDate: null }), SELECTION_DISPLAY_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [state.selectedDate, updateState]);

  useCalendarLayout({
    constrainHeightToContainer,
    gridRef,
    model,
    queryOpen,
    state,
    updateState,
  });

  useEffect(() => {
    plugin.performanceMonitor.record("render.calendar", performance.now() - renderStartedAt, {
      indexedTasks: tasks.length,
      visibleTasks: model.visibleTasks,
      days: model.days.length,
    });
  }, [model.days.length, model.visibleTasks, plugin.performanceMonitor, renderStartedAt, tasks.length]);

  const updateCompletionOverride = useCallback((taskId: string, completed: boolean | null, raw?: string) => {
    setCompletionOverrides((current) => {
      const next = new Map(current);
      if (completed === null) next.delete(taskId);
      else if (raw) next.set(taskId, { completed, raw });
      return next;
    });
  }, []);

  let taskIndex = 0;
  const nextTaskVisualKey = createTaskVisualKeyFactory();
  const renderTask = (task: CalendarTask, showSource: boolean, completesDay = false) => {
    const titleId = `tasks-calendar-${instanceId}-task-${taskIndex++}`;
    return (
      <TaskCard
        completesDay={completesDay}
        highlightNewRecurrence={highlightedTasks.has(taskVisualKey(task))}
        key={`${state.mode}:${nextTaskVisualKey(task)}`}
        onCompletionChange={updateCompletionOverride}
        onRecurringCompletion={expectRecurringTask}
        onRecurrencePreview={previewRecurrence}
        plugin={plugin}
        showSource={showSource}
        task={task}
        titleId={titleId}
      />
    );
  };

  return (
    <DndContext
      accessibility={{ announcements: dragAnnouncements }}
      collisionDetection={closestCenter}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={(event) => {
        const task = event.active.data.current?.task as CalendarTask | undefined;
        const date = event.over?.data.current?.date as string | undefined;
        setActiveTask(null);
        if (task && date) void plugin.rescheduleTask(task, date);
      }}
      onDragStart={(event) => {
        setActiveTask((event.active.data.current?.task as CalendarTask | undefined) ?? null);
      }}
      sensors={sensors}
    >
      <div
        className="tasks-calendar-react-root"
        style={{ "--tasks-calendar-completed-opacity": String(plugin.settings.completedOpacity) } as CSSProperties}
      >
        <CalendarToolbar
          onNavigate={(direction) =>
            updateState({
              anchor: toDateKey(moveAnchor(fromDateKey(state.anchor), state.mode, direction)),
              selectedDate: null,
            })
          }
          onQueryToggle={() => setQueryOpen((open) => !open)}
          onToday={() => updateState({ anchor: toDateKey(new Date()), selectedDate: null })}
          plugin={plugin}
          state={state}
          updateState={updateState}
        />
        {queryOpen ? <QueryEditor state={state} updateState={updateState} /> : null}
        {model.queryError ? <div className="tasks-calendar-error">{model.queryError}</div> : null}
        <CalendarGrid
          anchor={anchor}
          gridRef={gridRef}
          highlightedDays={highlightedDays}
          model={model}
          plugin={plugin}
          recurrencePreview={previewDays}
          renderTask={renderTask}
          state={state}
          updateState={updateState}
        />
        {model.overdueTasks.length > 0 ? (
          <section className="tasks-calendar-overdue-tasks">
            <header className="tasks-calendar-overdue-header">
              <h3>Overdue tasks</h3>
              <span className="tasks-calendar-overdue-count">{model.overdueTasks.length}</span>
            </header>
            <div className="tasks-calendar-task-list tasks-calendar-overdue-list">
              {model.overdueTasks.map((task) => (
                <TaskCard
                  highlightNewRecurrence={highlightedTasks.has(taskVisualKey(task))}
                  key={`overdue-${state.mode}:${nextTaskVisualKey(task)}`}
                  meta={
                    <span className="tasks-calendar-overdue-meta">
                      {calendarTaskDate(task, plugin.settings, model.today) ?? "No date"} ·{" "}
                      {task.path.replace(/\.md$/i, "")}
                    </span>
                  }
                  onCompletionChange={updateCompletionOverride}
                  onRecurringCompletion={expectRecurringTask}
                  onRecurrencePreview={previewRecurrence}
                  plugin={plugin}
                  showSource={false}
                  task={task}
                  titleId={`tasks-calendar-${instanceId}-task-${taskIndex++}`}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {createPortal(
        <TaskDragOverlay task={activeTask} completedOpacity={plugin.settings.completedOpacity} />,
        document.body,
      )}
    </DndContext>
  );
});

function TaskDragOverlay({ completedOpacity, task }: { completedOpacity: number; task: CalendarTask | null }) {
  return (
    <DragOverlay dropAnimation={null}>
      {task ? (
        <div
          className={`tasks-calendar-task tasks-calendar-drag-overlay${task.completed ? " is-completed" : ""}`}
          data-priority={task.priority}
          style={{ "--tasks-calendar-completed-opacity": String(completedOpacity) } as CSSProperties}
        >
          <span className="tasks-calendar-drag-checkbox">{task.completed ? "✓" : ""}</span>
          <span className="tasks-calendar-task-title">{task.description || "Untitled task"}</span>
        </div>
      ) : null}
    </DragOverlay>
  );
}

function dragTaskName(value: unknown): string {
  const task = value as CalendarTask | undefined;
  return task?.description || "Untitled task";
}
