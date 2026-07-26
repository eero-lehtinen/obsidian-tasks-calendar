import { useDroppable } from "@dnd-kit/core";
import type { HTMLAttributes, ReactNode, RefObject } from "react";
import { isoWeekNumber, toDateKey } from "./date-utils";
import type { CalendarModel } from "./calendar-model";
import type TasksCalendarPlugin from "./main";
import type { CalendarState, CalendarTask } from "./types";
import type { CalendarStateUpdate } from "./calendar-toolbar";

export function CalendarGrid({
  anchor,
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
  gridRef: RefObject<HTMLDivElement | null>;
  highlightedDays: Set<string>;
  model: CalendarModel;
  plugin: TasksCalendarPlugin;
  recurrencePreview: Set<string>;
  renderTask: (task: CalendarTask, showSource: boolean, completesDay?: boolean) => ReactNode;
  state: CalendarState;
  updateState: CalendarStateUpdate;
}) {
  return (
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
        const dayClasses = [
          "tasks-calendar-day",
          key === model.today ? "is-today" : "",
          key === state.selectedDate ? "is-selected" : "",
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
                  renderTask(task, state.mode === "week", !task.completed && remainingDayTasks === 1),
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
  );
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
