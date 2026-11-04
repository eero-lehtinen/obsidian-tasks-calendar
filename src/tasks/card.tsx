import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setTooltip } from "obsidian";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type TasksCalendarPlugin from "../main";
import type { CalendarTask } from "../types";
import { showTaskActions } from "./actions-menu";
import {
  playCompletionFeedback,
  playRecurrenceCreatedFeedback,
  TASK_COMPLETION_FEEDBACK_DURATION_MS,
} from "./completion-feedback";
import {
  getTaskName,
  getVisiblePriority,
  PriorityIcon,
  RecurrenceIcon,
  TaskCheckbox,
  type TaskDragBinding,
  TaskTitle,
} from "./item-content";

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

export function DraggableTaskCard(props: TaskCardProps) {
  const { task, calendarDate } = props;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } = useDraggable({
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
          transform: CSS.Translate.toString(transform),
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
  const priority = getVisiblePriority(task);
  const taskName = getTaskName(task);
  return (
    <div
      className={`tasks-calendar-task tasks-calendar-drag-overlay${task.recurrence ? " has-recurrence" : ""}${priority ? " has-priority" : ""}${task.completed ? " is-completed" : ""}`}
      data-priority={task.priority}
      style={{ "--tasks-calendar-completed-opacity": String(completedOpacity) } as CSSProperties}
    >
      <TaskCheckbox checked={task.completed} />
      <TaskTitle app={plugin.app} sourcePath={task.path} taskName={taskName} />
      {priority ? <PriorityIcon priority={priority} /> : null}
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
  const priority = getVisiblePriority(task);
  const taskName = getTaskName(task);
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
    if (target.closest("a, .tasks-calendar-checkbox, .tasks-calendar-task-source")) return;

    lastPointerType.current = "mouse";
    void plugin.editTask(task);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("a")) return;
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
      className={`tasks-calendar-task${task.recurrence ? " has-recurrence" : ""}${priority ? " has-priority" : ""}${styledCompleted ? " is-completed" : ""}${drag?.isDragging ? " is-dragging" : ""}`}
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
      <TaskTitle
        {...(drag ? { drag } : {})}
        app={plugin.app}
        onEdit={() => void plugin.editTask(task)}
        sourcePath={task.path}
        taskName={taskName}
        titleId={titleId}
      />
      {priority ? <PriorityIcon priority={priority} /> : null}
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
