// biome-ignore-all lint/a11y/useSemanticElements: The ARIA grid must remain a flat CSS grid for draggable day cells.
// biome-ignore-all lint/a11y/useFocusableInteractive: Grid headers describe cells and are not interaction targets.
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Platform, setTooltip } from "obsidian";
import type { HTMLAttributes, ReactNode, RefObject } from "react";
import { useCallback } from "react";
import type TasksCalendarPlugin from "../main";
import type { CalendarState, CalendarTask } from "../types";
import { isoWeekNumber, toDateKey } from "./date-utils";
import { showDayActions } from "./day-actions-menu";
import type { CalendarModel } from "./model";
import type { CalendarStateUpdate } from "./toolbar";

const dayTooltipOptions = { placement: "bottom" as const, delay: 200 };

export function CalendarGrid({
  anchor,
  dropTargetDate,
  gridRef,
  highlightedDays,
  model,
  plugin,
  recurrencePreview,
  renderTask,
  state,
  updateState,
}: {
  anchor: Date;
  dropTargetDate: string | null;
  gridRef: RefObject<HTMLDivElement | null>;
  highlightedDays: Set<string>;
  model: CalendarModel;
  plugin: TasksCalendarPlugin;
  recurrencePreview: Set<string>;
  renderTask: (task: CalendarTask, date: string, showSource: boolean, completesDay?: boolean) => ReactNode;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}) {
  return (
    <div aria-label="Tasks calendar" className={`tasks-calendar-grid is-${state.mode}`} ref={gridRef} role="grid">
      {state.mode !== "day" ? (
        <div
          aria-label="ISO week number"
          className="tasks-calendar-weekday tasks-calendar-week-number-header"
          role="columnheader"
        >
          Wk
        </div>
      ) : null}
      {model.days.slice(0, 7).map((day) => (
        <div className="tasks-calendar-weekday" key={`weekday-${day.getDay()}`} role="columnheader">
          {new Intl.DateTimeFormat(undefined, {
            weekday: Platform.isMobile && state.mode !== "day" ? "narrow" : state.mode === "month" ? "short" : "long",
          }).format(day)}
        </div>
      ))}
      {model.days.map((day, index) => {
        const key = toDateKey(day);
        const dayTasks = model.tasksByDate.get(key) ?? [];
        const activeTasks = dayTasks.filter((task) => !task.completed);
        const completedTasks = dayTasks.filter((task) => task.completed);
        const dayTooltip = `${day.toDateString()}, ${dayTasks.length} tasks`;
        const remainingDayTasks = dayTasks.filter((task) => !task.completed).length;
        const dayClasses = [
          "tasks-calendar-day",
          key === model.today ? "is-today" : "",
          state.mode === "month" && day.getMonth() !== anchor.getMonth() ? "is-outside" : "",
          recurrencePreview.has(key) || highlightedDays.has(key) ? "is-recurrence-preview" : "",
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
            showWeekNumber={state.mode !== "day"}
            weekNumber={isoWeekNumber(model.days[index + 3] ?? day)}
          >
            <DroppableDay
              aria-label={dayTooltip}
              className={dayClasses}
              date={key}
              isDropTarget={dropTargetDate === key}
              onContextMenu={(event) => {
                if ((event.target as Element).closest(".tasks-calendar-task, .tasks-calendar-more, button, input"))
                  return;
                event.preventDefault();
                showDayActions(plugin, key, { x: event.clientX, y: event.clientY });
              }}
              onDoubleClick={(event) => {
                if ((event.target as Element).closest(".tasks-calendar-task, .tasks-calendar-more, button, input"))
                  return;
                updateState({ anchor: key, mode: "day" });
              }}
              role="gridcell"
              tooltip={dayTooltip}
            >
              <div className="tasks-calendar-day-heading">
                <button
                  onClick={() => updateState({ anchor: key, mode: "day" })}
                  className="tasks-calendar-day-number"
                  type="button"
                >
                  {state.mode !== "month"
                    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day)
                    : day.getDate()}
                </button>
                {dayTasks.length > 0 ? <span className="tasks-calendar-day-count">{dayTasks.length}</span> : null}
              </div>
              <div className="tasks-calendar-task-list">
                <SortableContext
                  id={`tasks:${key}:active`}
                  items={activeTasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {activeTasks.map((task) =>
                    renderTask(
                      task,
                      key,
                      state.mode !== "month" && plugin.settings.showTaskSource,
                      !task.completed && remainingDayTasks === 1,
                    ),
                  )}
                </SortableContext>
                <SortableContext
                  id={`tasks:${key}:completed`}
                  items={completedTasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {completedTasks.map((task) =>
                    renderTask(task, key, state.mode !== "month" && plugin.settings.showTaskSource),
                  )}
                </SortableContext>
                {state.mode === "month" && dayTasks.length > 0 ? (
                  <button
                    className="tasks-calendar-more"
                    hidden
                    onClick={() => updateState({ anchor: key, mode: "day" })}
                    type="button"
                  />
                ) : null}
              </div>
            </DroppableDay>
          </DayFragment>
        );
      })}
    </div>
  );
}

function DroppableDay({
  children,
  className,
  date,
  isDropTarget,
  tooltip,
  ...props
}: {
  children: ReactNode;
  className: string;
  date: string;
  isDropTarget: boolean;
  tooltip: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const { setNodeRef } = useDroppable({
    id: `date:${date}`,
    data: { date },
  });
  const setDayRef = useCallback(
    (element: HTMLDivElement | null) => {
      setNodeRef(element);
      if (element) setTooltip(element, tooltip, dayTooltipOptions);
    },
    [setNodeRef, tooltip],
  );

  return (
    <div {...props} className={`${className}${isDropTarget ? " is-drop-target" : ""}`} data-date={date} ref={setDayRef}>
      {children}
    </div>
  );
}

function DayFragment({
  children,
  current,
  index,
  showWeekNumber,
  weekNumber,
}: {
  children: ReactNode;
  current: boolean;
  index: number;
  showWeekNumber: boolean;
  weekNumber: number;
}) {
  return (
    <>
      {showWeekNumber && index % 7 === 0 ? (
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
