import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setIcon, setTooltip } from "obsidian";
import type {
  ChangeEventHandler,
  CSSProperties,
  KeyboardEventHandler,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playCompletionFeedback,
  playRecurrenceCreatedFeedback,
  TASK_COMPLETION_FEEDBACK_DURATION_MS,
} from "./completion-feedback";
import type TasksCalendarPlugin from "./main";
import { showTaskActions } from "./task-actions-menu";
import type { CalendarTask } from "./types";

interface TaskCardProps {
  calendarDate: string;
  completesDay?: boolean;
  highlightNewRecurrence: boolean;
  onCompletionChange: (taskId: string, completed: boolean | null, raw?: string) => void;
  onRecurringCompletion: (task: CalendarTask) => void;
  plugin: TasksCalendarPlugin;
  meta?: ReactNode;
  showSource: boolean;
  task: CalendarTask;
  titleId: string;
  onRecurrencePreview: (task: CalendarTask | null) => void;
}

interface TaskDragBinding {
  attributes: DraggableAttributes;
  isDragging: boolean;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}

const tooltipOptions = { placement: "bottom" as const, delay: 200 };
const completionStyleDelayMs = TASK_COMPLETION_FEEDBACK_DURATION_MS * 0.65;
const completionMoveDelayMs = 200;

export function SortableTaskCard(props: TaskCardProps) {
  const { task, calendarDate } = props;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { date: calendarDate, showSource: props.showSource, task },
  });
  return (
    <TaskCardView
      {...props}
      drag={{
        attributes,
        isDragging,
        listeners,
        setActivatorNodeRef,
        setNodeRef,
        style: {
          opacity: isDragging ? 0 : undefined,
          transform: CSS.Transform.toString(transform),
          transition,
        },
      }}
    />
  );
}

export function TaskCard(props: TaskCardProps) {
  return <TaskCardView {...props} />;
}

export function TaskDragPreview({
  completedOpacity,
  plugin,
  showSource,
  task,
}: {
  completedOpacity: number;
  plugin: TasksCalendarPlugin;
  showSource: boolean;
  task: CalendarTask;
}) {
  const taskName = task.description || "Untitled task";
  return (
    <div
      className={`tasks-calendar-task tasks-calendar-drag-overlay${task.recurrence ? " has-recurrence" : ""}${task.completed ? " is-completed" : ""}`}
      data-priority={task.priority}
      style={{ "--tasks-calendar-completed-opacity": String(completedOpacity) } as CSSProperties}
    >
      <TaskCheckbox checked={task.completed} />
      <TaskTitle taskName={taskName} />
      {task.recurrence ? <RecurrenceIcon interactive={false} recurrence={task.recurrence} /> : null}
      {showSource ? <TaskSourceButton interactive={false} plugin={plugin} task={task} /> : null}
      <span aria-hidden="true" className="tasks-calendar-completion-overlay" />
    </div>
  );
}

function TaskCardView({
  completesDay = false,
  highlightNewRecurrence,
  onCompletionChange,
  onRecurringCompletion,
  plugin,
  meta,
  showSource,
  task,
  titleId,
  onRecurrencePreview,
  drag,
}: TaskCardProps & { drag?: TaskDragBinding }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const completionOutlineRef = useRef<HTMLSpanElement>(null);
  const completionPending = useRef(false);
  const completionStyleTimer = useRef<number | null>(null);
  const checkboxAnimationTimer = useRef<number | null>(null);
  const pendingRaw = useRef<string | null>(null);
  const lastPointerType = useRef("mouse");
  const suppressClicksUntil = useRef(0);
  const [optimisticCompleted, setOptimisticCompleted] = useState(task.completed);
  const [styledCompleted, setStyledCompleted] = useState(task.completed);
  const [isChecking, setIsChecking] = useState(false);
  const taskName = task.description || "Untitled task";
  const dragSetNodeRef = drag?.setNodeRef;
  const setItemRef = useCallback(
    (element: HTMLDivElement | null) => {
      itemRef.current = element;
      dragSetNodeRef?.(element);
    },
    [dragSetNodeRef],
  );
  const pointerListeners = { ...drag?.listeners };
  delete pointerListeners.onKeyDown;

  useTooltip(itemRef, taskName);
  useEffect(() => {
    setOptimisticCompleted(task.completed);
    if (completionStyleTimer.current === null) setStyledCompleted(task.completed);
    if (completionPending.current && pendingRaw.current !== null && task.raw !== pendingRaw.current) {
      completionPending.current = false;
      pendingRaw.current = null;
    }
  }, [task.completed, task.raw]);
  useEffect(
    () => () => {
      if (completionStyleTimer.current !== null) window.clearTimeout(completionStyleTimer.current);
      if (checkboxAnimationTimer.current !== null) window.clearTimeout(checkboxAnimationTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (highlightNewRecurrence && completionOutlineRef.current) {
      playRecurrenceCreatedFeedback(completionOutlineRef.current, plugin.settings.forceAnimations);
    }
  }, [highlightNewRecurrence, plugin.settings.forceAnimations]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressClicksUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target as Element;
    if (target.closest(".tasks-calendar-checkbox, .tasks-calendar-task-source")) return;

    const isTouch = lastPointerType.current === "touch";
    lastPointerType.current = "mouse";
    if (isTouch) {
      event.preventDefault();
      showTaskActions(plugin, task, { x: event.clientX, y: event.clientY });
      return;
    }
    void plugin.editTask(task);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (lastPointerType.current === "touch") {
      suppressClicksUntil.current = performance.now() + 750;
    }
    lastPointerType.current = "mouse";
    showTaskActions(plugin, task, { x: event.clientX, y: event.clientY });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: The title button provides the keyboard equivalent for card editing.
    <div
      className={`tasks-calendar-task${task.recurrence ? " has-recurrence" : ""}${styledCompleted ? " is-completed" : ""}${drag?.isDragging ? " is-dragging" : ""}`}
      data-priority={task.priority}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDownCapture={(event: PointerEvent<HTMLDivElement>) => {
        lastPointerType.current = event.pointerType;
      }}
      ref={setItemRef}
      {...pointerListeners}
      style={drag?.style}
    >
      <TaskCheckbox
        checked={optimisticCompleted}
        isChecking={isChecking}
        onChange={(event) => {
          if (completionPending.current) {
            event.currentTarget.checked = optimisticCompleted;
            return;
          }

          const completed = !optimisticCompleted;
          completionPending.current = true;
          pendingRaw.current = task.raw;
          setOptimisticCompleted(completed);
          if (completionStyleTimer.current !== null) {
            window.clearTimeout(completionStyleTimer.current);
            completionStyleTimer.current = null;
          }
          if (checkboxAnimationTimer.current !== null) {
            window.clearTimeout(checkboxAnimationTimer.current);
            checkboxAnimationTimer.current = null;
          }
          if (completed) {
            setIsChecking(true);
            checkboxAnimationTimer.current = window.setTimeout(() => {
              checkboxAnimationTimer.current = null;
              setIsChecking(false);
            }, 750);
            if (task.recurrence) onRecurringCompletion(task);
            playCompletionFeedback(
              event.currentTarget,
              completionOutlineRef.current,
              completesDay,
              plugin.settings.forceAnimations,
            );
            completionStyleTimer.current = window.setTimeout(() => {
              completionStyleTimer.current = null;
              setStyledCompleted(true);
            }, completionStyleDelayMs);
          } else {
            setIsChecking(false);
            setStyledCompleted(false);
          }

          const applyCompletion = () => {
            onCompletionChange(task.id, completed, task.raw);
            void plugin.toggleTask(task).then((updated) => {
              if (!updated) {
                if (completionStyleTimer.current !== null) {
                  window.clearTimeout(completionStyleTimer.current);
                  completionStyleTimer.current = null;
                }
                if (checkboxAnimationTimer.current !== null) {
                  window.clearTimeout(checkboxAnimationTimer.current);
                  checkboxAnimationTimer.current = null;
                }
                setIsChecking(false);
                setOptimisticCompleted(!completed);
                setStyledCompleted(!completed);
                onCompletionChange(task.id, null);
                completionPending.current = false;
                pendingRaw.current = null;
              }
            });
          };

          if (completed) window.setTimeout(applyCompletion, completionMoveDelayMs);
          else applyCompletion();
        }}
        titleId={titleId}
      />
      <TaskTitle {...(drag ? { drag } : {})} taskName={taskName} titleId={titleId} />
      {task.recurrence ? (
        <RecurrenceIcon
          interactive
          recurrence={task.recurrence}
          onPreviewEnd={() => onRecurrencePreview(null)}
          onPreviewStart={() => onRecurrencePreview(task)}
        />
      ) : null}
      {showSource ? <TaskSourceButton interactive plugin={plugin} task={task} /> : null}
      {meta}
      <span aria-hidden="true" className="tasks-calendar-completion-overlay" ref={completionOutlineRef} />
    </div>
  );
}

function TaskCheckbox({
  checked,
  isChecking = false,
  onChange,
  titleId,
}: {
  checked: boolean;
  isChecking?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  titleId?: string;
}) {
  return (
    <span
      className={`tasks-calendar-checkbox-control${checked ? " is-checked" : ""}${isChecking ? " is-checking" : ""}`}
    >
      <input
        {...(titleId
          ? {
              "aria-description": `${checked ? "Reopen" : "Complete"} this task`,
              "aria-labelledby": titleId,
            }
          : { "aria-hidden": true, tabIndex: -1 })}
        checked={checked}
        className="tasks-calendar-checkbox"
        {...(onChange ? { onChange, onClick: (event) => event.stopPropagation() } : { readOnly: true })}
        type="checkbox"
      />
      <svg aria-hidden="true" className="tasks-calendar-checkbox-check" viewBox="0 0 16 16">
        <path d="M3.2 8.2 6.5 11.3 12.9 4.8" pathLength="1" />
      </svg>
    </span>
  );
}

function TaskTitle({ drag, taskName, titleId }: { drag?: TaskDragBinding; taskName: string; titleId?: string }) {
  const keyboardOnKeyDown = drag?.listeners?.onKeyDown;
  const keyboardDragProps = keyboardOnKeyDown
    ? { onKeyDown: keyboardOnKeyDown as KeyboardEventHandler<HTMLButtonElement> }
    : {};
  return (
    <button
      {...(titleId ? { id: titleId } : { "aria-hidden": true, tabIndex: -1 })}
      className="tasks-calendar-task-title"
      type="button"
      {...(drag ? { ...drag.attributes, ref: drag.setActivatorNodeRef } : {})}
      {...keyboardDragProps}
    >
      {taskName}
    </button>
  );
}

function RecurrenceIcon({
  interactive,
  recurrence,
  onPreviewEnd,
  onPreviewStart,
}: {
  interactive: boolean;
  recurrence: string;
  onPreviewEnd?: () => void;
  onPreviewStart?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    setIcon(ref.current, "repeat-2");
    setTooltip(ref.current, `Repeats: ${recurrence}`, tooltipOptions);
  }, [recurrence]);

  return (
    <button
      {...(interactive ? { "aria-label": `Preview recurrence: ${recurrence}` } : { "aria-hidden": true, tabIndex: -1 })}
      className="tasks-calendar-recurrence"
      {...(interactive
        ? {
            onBlur: onPreviewEnd,
            onFocus: onPreviewStart,
            onPointerEnter: onPreviewStart,
            onPointerLeave: onPreviewEnd,
          }
        : {})}
      ref={ref}
      type="button"
    />
  );
}

function TaskSourceButton({
  interactive,
  plugin,
  task,
}: {
  interactive: boolean;
  plugin: TasksCalendarPlugin;
  task: CalendarTask;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (interactive && ref.current) setTooltip(ref.current, `Open ${task.path}`, tooltipOptions);
  }, [interactive, task.path]);

  return (
    <button
      {...(interactive ? { onClick: () => void plugin.openTask(task) } : { "aria-hidden": true, tabIndex: -1 })}
      className="tasks-calendar-task-source"
      ref={ref}
      type="button"
    >
      {task.path.replace(/\.md$/i, "").split("/").pop()}
    </button>
  );
}

function useTooltip(ref: RefObject<HTMLElement | null>, text: string): void {
  useEffect(() => {
    if (ref.current) setTooltip(ref.current, text, tooltipOptions);
  }, [ref, text]);
}
