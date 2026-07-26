import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements } from "@dnd-kit/core";
import { MarkdownRenderChild, Platform, setIcon } from "obsidian";
import {
  StrictMode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { CalendarLayoutController, type MonthCellLayout } from "./calendar-layout";
import { createCalendarModel, calendarTaskDate } from "./calendar-model";
import {
  applyCompletionOverrides,
  reconcileCompletionOverrides,
  type CompletionOverride,
} from "./completion-overrides";
import { RECURRENCE_CREATED_FEEDBACK_DURATION_MS } from "./completion-feedback";
import { fromDateKey, isoWeekNumber, moveAnchor, titleForRange, toDateKey } from "./date-utils";
import type TasksCalendarPlugin from "./main";
import { capturePendingRecurrence, findCreatedRecurrence, type PendingRecurrenceCreation } from "./recurrence-created";
import { recurrenceDateKeys } from "./recurrence";
import { TaskCard } from "./task-card";
import { createTaskVisualKeyFactory, taskVisualKey } from "./task-visual-key";
import type { CalendarMode, CalendarState, CalendarTask } from "./types";

interface CalendarHandle {
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

let nextCalendarInstanceId = 0;
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

export class TasksCalendarRenderer extends MarkdownRenderChild {
  private readonly calendarRef = { current: null as CalendarHandle | null };
  private readonly initial: CalendarState;
  private readonly instanceId = nextCalendarInstanceId++;
  private root: Root | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: TasksCalendarPlugin,
    initial: Partial<CalendarState> = {},
    private readonly onStateChange?: (state: CalendarState) => void,
    private readonly constrainHeightToContainer = false,
  ) {
    super(containerEl);
    this.initial = {
      mode: initial.mode ?? plugin.settings.defaultView,
      anchor: initial.anchor ?? toDateKey(new Date()),
      query: initial.query ?? plugin.settings.defaultQuery,
      showCompleted: initial.showCompleted ?? plugin.settings.showCompleted,
      search: initial.search ?? "",
      monthHeight: initial.monthHeight ?? null,
      weekHeight: initial.weekHeight ?? null,
      selectedDate: initial.selectedDate ?? null,
    };
  }

  onload(): void {
    this.containerEl.addClass("tasks-calendar");
    this.root = createRoot(this.containerEl);
    this.registerEvent(this.plugin.taskStore.on("tasks-calendar:changed", () => this.calendarRef.current?.refresh()));
    this.root.render(
      <StrictMode>
        <CalendarApp
          initial={this.initial}
          instanceId={this.instanceId}
          onStateChange={this.onStateChange}
          plugin={this.plugin}
          constrainHeightToContainer={this.constrainHeightToContainer}
          ref={this.calendarRef}
        />
      </StrictMode>,
    );
  }

  onunload(): void {
    this.root?.unmount();
    this.root = null;
    this.containerEl.removeClass("tasks-calendar");
  }

  refresh(): void {
    this.calendarRef.current?.refresh();
  }

  getState(): CalendarState {
    return this.calendarRef.current?.getState() ?? { ...this.initial };
  }

  setState(state: Partial<CalendarState>): void {
    this.calendarRef.current?.setState(state);
  }
}

const CalendarApp = forwardRef(function CalendarApp(
  { constrainHeightToContainer, initial, instanceId, onStateChange, plugin }: CalendarAppProps,
  ref: Ref<CalendarHandle>,
) {
  const [state, setState] = useState(initial);
  const [queryOpen, setQueryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [activeTask, setActiveTask] = useState<CalendarTask | null>(null);
  const [completionOverrides, setCompletionOverrides] = useState<Map<string, CompletionOverride>>(() => new Map());
  const [highlightedRecurrences, setHighlightedRecurrences] = useState<Set<string>>(() => new Set());
  const [highlightedRecurrenceDays, setHighlightedRecurrenceDays] = useState<Set<string>>(() => new Set());
  const [recurrencePreview, setRecurrencePreview] = useState<Set<string>>(() => new Set());
  const pendingRecurrences = useRef<PendingRecurrenceCreation[]>([]);
  const stateRef = useRef(state);
  const gridRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(new CalendarLayoutController());
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

  useEffect(() => {
    setCompletionOverrides((current) => reconcileCompletionOverrides(tasks, current));

    const unresolved: PendingRecurrenceCreation[] = [];
    const createdKeys: string[] = [];
    const createdDayKeys: string[] = [];
    for (const pending of pendingRecurrences.current) {
      const created = findCreatedRecurrence(tasks, pending);
      if (created) {
        createdKeys.push(taskVisualKey(created));
        const date = calendarTaskDate(created, plugin.settings, model.today);
        if (date) createdDayKeys.push(date);
      } else unresolved.push(pending);
    }
    pendingRecurrences.current = unresolved;

    if (createdKeys.length > 0) {
      setHighlightedRecurrences((current) => new Set([...current, ...createdKeys]));
      setHighlightedRecurrenceDays((current) => new Set([...current, ...createdDayKeys]));
      window.setTimeout(() => {
        setHighlightedRecurrences((current) => {
          const next = new Set(current);
          for (const key of createdKeys) next.delete(key);
          return next;
        });
        setHighlightedRecurrenceDays((current) => {
          const next = new Set(current);
          for (const key of createdDayKeys) next.delete(key);
          return next;
        });
      }, RECURRENCE_CREATED_FEEDBACK_DURATION_MS);
    }
  }, [revision]);

  useEffect(() => {
    if (!state.selectedDate) return;

    const timeoutId = window.setTimeout(() => {
      updateState({ selectedDate: null });
    }, SELECTION_DISPLAY_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [state.selectedDate, updateState]);

  const updateCompletionOverride = useCallback((taskId: string, completed: boolean | null, raw?: string) => {
    setCompletionOverrides((current) => {
      const next = new Map(current);
      if (completed === null) next.delete(taskId);
      else if (raw) next.set(taskId, { completed, raw });
      return next;
    });
  }, []);

  const expectRecurringTask = (task: CalendarTask) => {
    const pending = capturePendingRecurrence(task, tasks);
    if (pending) pendingRecurrences.current.push(pending);
  };

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const grid = gridRef.current;
    if (!grid) return;
    layout.reset();

    const heightKey = state.mode === "week" ? "weekHeight" : "monthHeight";
    const desiredHeight = state[heightKey];
    layout.observeHeight(
      grid,
      desiredHeight,
      (height) => {
        if (height !== stateRef.current[heightKey]) updateState({ [heightKey]: height });
      },
      constrainHeightToContainer
        ? () =>
            Math.max(0, (grid.parentElement?.getBoundingClientRect().bottom ?? 0) - grid.getBoundingClientRect().top)
        : null,
    );

    if (state.mode === "month") {
      const layouts = Array.from(grid.querySelectorAll<HTMLElement>(".tasks-calendar-day"))
        .map((cell): MonthCellLayout | null => {
          const list = cell.querySelector<HTMLElement>(".tasks-calendar-task-list");
          const moreButton = cell.querySelector<HTMLButtonElement>(".tasks-calendar-more");
          if (!list || !moreButton) return null;
          return {
            cell,
            moreButton,
            taskElements: Array.from(list.querySelectorAll<HTMLElement>(":scope > .tasks-calendar-task")),
          };
        })
        .filter((value): value is MonthCellLayout => value !== null);
      layout.observeMonth(grid, layouts);
    }
    return () => layout.reset();
  }, [constrainHeightToContainer, model, queryOpen, state.mode, state.monthHeight, state.weekHeight, updateState]);

  useEffect(() => {
    plugin.performanceMonitor.record("render.calendar", performance.now() - renderStartedAt, {
      indexedTasks: tasks.length,
      visibleTasks: model.visibleTasks,
      days: model.days.length,
    });
  }, [model.days.length, model.visibleTasks, plugin.performanceMonitor, renderStartedAt, tasks.length]);

  const previewRecurrence = (task: CalendarTask | null) => {
    if (!task?.recurrence || model.days.length === 0) {
      setRecurrencePreview(new Set());
      return;
    }
    const baseDate = calendarTaskDate(task, plugin.settings, model.today);
    if (!baseDate) return;
    setRecurrencePreview(
      recurrenceDateKeys(
        task.recurrence,
        baseDate,
        toDateKey(model.days[0]),
        toDateKey(model.days[model.days.length - 1]),
      ),
    );
  };

  let taskIndex = 0;
  const nextTaskVisualKey = createTaskVisualKeyFactory();
  const taskCard = (task: CalendarTask, showSource: boolean, completesDay = false) => {
    const titleId = `tasks-calendar-${instanceId}-task-${taskIndex}`;
    taskIndex += 1;
    return (
      <TaskCard
        completesDay={completesDay}
        highlightNewRecurrence={highlightedRecurrences.has(taskVisualKey(task))}
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

  const calendarStyle = {
    "--tasks-calendar-completed-opacity": String(plugin.settings.completedOpacity),
  } as CSSProperties;

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
      <div className="tasks-calendar-react-root" style={calendarStyle}>
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
        <div aria-label="Tasks calendar" className={`tasks-calendar-grid is-${state.mode}`} ref={gridRef} role="grid">
          <div
            aria-label="ISO week number"
            className="tasks-calendar-weekday tasks-calendar-week-number-header"
            role="columnheader"
          >
            Wk
          </div>
          {model.days.slice(0, 7).map((day) => (
            <div className="tasks-calendar-weekday" key={`weekday-${day.getDay()}`} role="columnheader">
              {new Intl.DateTimeFormat(undefined, { weekday: state.mode === "week" ? "long" : "short" }).format(day)}
            </div>
          ))}
          {model.days.map((day, index) => {
            const key = toDateKey(day);
            const dayTasks = model.tasksByDate.get(key) ?? [];
            const remainingDayTasks = dayTasks.filter((task) => !task.completed).length;
            const isOutside = state.mode === "month" && day.getMonth() !== anchor.getMonth();
            const dayClasses = [
              "tasks-calendar-day",
              key === model.today ? "is-today" : "",
              key === state.selectedDate ? "is-selected" : "",
              isOutside ? "is-outside" : "",
              recurrencePreview.has(key) || highlightedRecurrenceDays.has(key) ? "is-recurrence-preview" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <DayFragment
                current={
                  index % 7 === 0 &&
                  model.days.slice(index, index + 7).some((weekDay) => toDateKey(weekDay) === model.today)
                }
                index={index}
                key={`${state.mode}:${state.anchor}:${key}`}
                weekNumber={isoWeekNumber(model.days[index + 3] ?? day)}
              >
                <DroppableDay
                  aria-label={`${day.toDateString()}, ${dayTasks.length} tasks`}
                  aria-selected={key === state.selectedDate}
                  className={dayClasses}
                  date={key}
                  onContextMenu={(event) => {
                    if ((event.target as Element).closest(".tasks-calendar-task, .tasks-calendar-more, button, input"))
                      return;
                    event.preventDefault();
                    void plugin.createTask(key);
                  }}
                  role="gridcell"
                >
                  <div className="tasks-calendar-day-heading">
                    <button
                      onClick={() => updateState({ anchor: key, mode: "week", selectedDate: key })}
                      className="tasks-calendar-day-number"
                      type="button"
                    >
                      {state.mode === "week"
                        ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day)
                        : day.getDate()}
                    </button>
                    {dayTasks.length > 0 ? <span className="tasks-calendar-day-count">{dayTasks.length}</span> : null}
                  </div>
                  <div className="tasks-calendar-task-list">
                    {dayTasks.map((task) =>
                      taskCard(task, state.mode === "week", !task.completed && remainingDayTasks === 1),
                    )}
                    {state.mode === "month" && dayTasks.length > 0 ? (
                      <button
                        className="tasks-calendar-more"
                        hidden
                        onClick={() => updateState({ anchor: key, mode: "week", selectedDate: key })}
                        type="button"
                      />
                    ) : null}
                  </div>
                </DroppableDay>
              </DayFragment>
            );
          })}
        </div>
        {model.overdueTasks.length > 0 ? (
          <section className="tasks-calendar-overdue-tasks">
            <header className="tasks-calendar-overdue-header">
              <h3>Overdue tasks</h3>
              <span className="tasks-calendar-overdue-count">{model.overdueTasks.length}</span>
            </header>
            <div className="tasks-calendar-task-list tasks-calendar-overdue-list">
              {model.overdueTasks.map((task) => (
                <TaskCard
                  highlightNewRecurrence={highlightedRecurrences.has(taskVisualKey(task))}
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
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div
              className={`tasks-calendar-task tasks-calendar-drag-overlay${activeTask.completed ? " is-completed" : ""}`}
              data-priority={activeTask.priority}
              style={
                {
                  "--tasks-calendar-completed-opacity": String(plugin.settings.completedOpacity),
                } as CSSProperties
              }
            >
              <span className="tasks-calendar-drag-checkbox">{activeTask.completed ? "✓" : ""}</span>
              <span className="tasks-calendar-task-title">{activeTask.description || "Untitled task"}</span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
});

function dragTaskName(value: unknown): string {
  const task = value as CalendarTask | undefined;
  return task?.description || "Untitled task";
}

function DroppableDay({
  children,
  className,
  date,
  ...props
}: {
  children: ReactNode;
  className: string;
  date: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const { isOver, setNodeRef } = useDroppable({
    id: `date:${date}`,
    data: { date },
  });

  return (
    <div {...props} className={`${className}${isOver ? " is-drop-target" : ""}`} data-date={date} ref={setNodeRef}>
      {children}
    </div>
  );
}

function DayFragment({
  children,
  current,
  index,
  weekNumber,
}: {
  children: ReactNode;
  current: boolean;
  index: number;
  weekNumber: number;
}) {
  return (
    <>
      {index % 7 === 0 ? (
        <div
          aria-current={current ? "true" : undefined}
          aria-label={`Week ${weekNumber}`}
          className={`tasks-calendar-week-number${current ? " is-current" : ""}`}
          role="rowheader"
        >
          {weekNumber}
        </div>
      ) : null}
      {children}
    </>
  );
}

function CalendarToolbar({
  onNavigate,
  onQueryToggle,
  onToday,
  plugin,
  state,
  updateState,
}: {
  onNavigate: (direction: -1 | 1) => void;
  onQueryToggle: () => void;
  onToday: () => void;
  plugin: TasksCalendarPlugin;
  state: CalendarState;
  updateState: (state: Partial<CalendarState>) => void;
}) {
  return (
    <div className="tasks-calendar-toolbar">
      <div className="tasks-calendar-navigation">
        <button className="tasks-calendar-today-button" onClick={onToday} type="button">
          Today
        </button>
        <IconButton icon="chevron-left" label="Previous" onClick={() => onNavigate(-1)} />
        <IconButton icon="chevron-right" label="Next" onClick={() => onNavigate(1)} />
      </div>
      <h2 className="tasks-calendar-title">
        {titleForRange(fromDateKey(state.anchor), state.mode, plugin.settings.weekStartsOn)}
      </h2>
      <div className="tasks-calendar-controls">
        <input
          aria-label="Search tasks"
          className="tasks-calendar-search"
          onChange={(event) => updateState({ search: event.target.value })}
          placeholder="Search tasks"
          type="search"
          value={state.search}
        />
        <IconButton
          active={Boolean(state.query.trim())}
          icon="list-filter"
          label="Edit task filters"
          onClick={onQueryToggle}
        />
        <IconButton
          icon={state.showCompleted ? "eye" : "eye-off"}
          label={state.showCompleted ? "Hide completed tasks" : "Show completed tasks"}
          onClick={() => updateState({ showCompleted: !state.showCompleted })}
        />
        <div className="tasks-calendar-mode-switch">
          <ModeButton mode="month" state={state} updateState={updateState}>
            Month
          </ModeButton>
          <ModeButton mode="week" state={state} updateState={updateState}>
            Week
          </ModeButton>
        </div>
      </div>
    </div>
  );
}

function QueryEditor({
  state,
  updateState,
}: {
  state: CalendarState;
  updateState: (state: Partial<CalendarState>) => void;
}) {
  return (
    <div className="tasks-calendar-query-panel">
      <label>
        Task filters
        <span>One Tasks-style instruction per line</span>
      </label>
      <textarea
        className="tasks-calendar-query"
        onChange={(event) => updateState({ query: event.target.value })}
        placeholder={"not done\npath includes Projects\nscheduled before tomorrow"}
        rows={3}
        value={state.query}
      />
      <a
        className="tasks-calendar-query-help"
        href="https://publish.obsidian.md/tasks/Queries/Filters"
        rel="noreferrer"
        target="_blank"
      >
        Tasks query reference
      </a>
    </div>
  );
}

function IconButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) setIcon(ref.current, icon);
  }, [icon]);

  return (
    <button
      aria-label={label}
      className={`clickable-icon${active ? " is-active" : ""}`}
      data-tooltip-position={Platform.isMobile ? undefined : "top"}
      onClick={onClick}
      ref={ref}
      type="button"
    />
  );
}

function ModeButton({
  children,
  mode,
  state,
  updateState,
}: {
  children: ReactNode;
  mode: CalendarMode;
  state: CalendarState;
  updateState: (state: Partial<CalendarState>) => void;
}) {
  return (
    <button className={state.mode === mode ? "is-active" : ""} onClick={() => updateState({ mode })} type="button">
      {children}
    </button>
  );
}
