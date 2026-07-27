import type { Announcements } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MotionConfig } from "motion/react";
import type { CSSProperties, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarGrid } from "./calendar-grid";
import { calendarTaskDate, createCalendarModel } from "./calendar-model";
import { CalendarToolbar, QueryEditor } from "./calendar-toolbar";
import type { CompletionOverride } from "./completion-overrides";
import { applyCompletionOverrides, reconcileCompletionOverrides } from "./completion-overrides";
import { fromDateKey, moveAnchor, toDateKey } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import { TaskCard } from "./task-card";
import { taskOrderKey } from "./task-order";
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
  ref?: Ref<CalendarHandle>;
}

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
export function CalendarApp({
  constrainHeightToContainer,
  initial,
  instanceId,
  onStateChange,
  plugin,
  ref,
}: CalendarAppProps) {
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision invalidates the mutable task store snapshot.
  const tasks = useMemo(() => plugin.taskStore.getTasks(), [plugin.taskStore, revision]);
  const displayedTasks = useMemo(
    () => applyCompletionOverrides(tasks, completionOverrides),
    [completionOverrides, tasks],
  );
  const model = useMemo(
    () => createCalendarModel(displayedTasks, state, plugin.settings, anchor),
    [anchor, displayedTasks, plugin.settings, state],
  );
  const { expectRecurringTask, highlightedDays, highlightedTasks, previewDays, previewRecurrence } =
    useRecurrenceFeedback({
      days: model.days,
      plugin,
      tasks,
      today: model.today,
    });

  useEffect(() => {
    setCompletionOverrides((current) => reconcileCompletionOverrides(tasks, current));
  }, [tasks]);

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
  const renderTask = (task: CalendarTask, date: string, showSource: boolean, completesDay = false) => {
    const titleId = `tasks-calendar-${instanceId}-task-${taskIndex++}`;
    return (
      <TaskCard
        calendarDate={date}
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
    <MotionConfig reducedMotion={plugin.settings.forceAnimations ? "never" : "user"}>
      <DndContext
        accessibility={{ announcements: dragAnnouncements }}
        collisionDetection={closestCenter}
        onDragCancel={() => setActiveTask(null)}
        onDragEnd={(event) => {
          const task = event.active.data.current?.task as CalendarTask | undefined;
          const over = event.over;
          const date = over?.data.current?.date as string | undefined;
          const overTask = over?.data.current?.task as CalendarTask | undefined;
          setActiveTask(null);
          if (!task || !date || !over) return;

          const sourceDate = calendarTaskDate(task, plugin.settings, model.today);
          if (sourceDate !== date) {
            plugin.forgetTaskOrder(taskOrderKey(task));
            void plugin.rescheduleTask(task, date);
            return;
          }

          const targetTasks = model.tasksByDate.get(date) ?? [];
          const oldIndex = targetTasks.findIndex((candidate) => candidate.id === task.id);
          const newIndex =
            overTask === undefined
              ? targetTasks.length - 1
              : targetTasks.findIndex((candidate) => candidate.id === overTask.id);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
          plugin.rememberTaskOrder(date, arrayMove(targetTasks, oldIndex, newIndex).map(taskOrderKey));
        }}
        onDragStart={(event) => {
          const task = (event.active.data.current?.task as CalendarTask | undefined) ?? null;
          setActiveTask(task);
        }}
        sensors={sensors}
      >
        <div
          className={`tasks-calendar-react-root${plugin.settings.forceAnimations ? " tasks-calendar-force-animations" : ""}`}
          style={{ "--tasks-calendar-completed-opacity": String(plugin.settings.completedOpacity) } as CSSProperties}
        >
          <CalendarToolbar
            onNavigate={(direction) =>
              updateState({
                anchor: toDateKey(moveAnchor(fromDateKey(state.anchor), state.mode, direction)),
              })
            }
            onQueryToggle={() => setQueryOpen((open) => !open)}
            onToday={() => updateState({ anchor: toDateKey(new Date()) })}
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
                <SortableContext
                  id="tasks:overdue"
                  items={model.overdueTasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {model.overdueTasks.map((task) => (
                    <TaskCard
                      calendarDate={calendarTaskDate(task, plugin.settings, model.today) ?? model.today}
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
                </SortableContext>
              </div>
            </section>
          ) : null}
        </div>
        {createPortal(
          <TaskDragOverlay task={activeTask} completedOpacity={plugin.settings.completedOpacity} />,
          document.body,
        )}
      </DndContext>
    </MotionConfig>
  );
}

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
