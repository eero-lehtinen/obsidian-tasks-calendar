import { useDraggable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { setIcon, setTooltip } from "obsidian";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import { playCompletionFeedback } from "./completion-feedback";
import type TasksCalendarPlugin from "./main";
import { showTaskActions } from "./task-actions-menu";
import type { CalendarTask } from "./types";

interface TaskCardProps {
  completesDay?: boolean;
  onCompletionChange: (taskId: string, completed: boolean | null, raw?: string) => void;
  plugin: TasksCalendarPlugin;
  meta?: ReactNode;
  showSource: boolean;
  task: CalendarTask;
  titleId: string;
  onRecurrencePreview: (task: CalendarTask | null) => void;
}

const tooltipOptions = { placement: "bottom" as const, delay: 200 };
const layoutTransition = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.75 };

export function TaskCard({
  completesDay = false,
  onCompletionChange,
  plugin,
  meta,
  showSource,
  task,
  titleId,
  onRecurrencePreview,
}: TaskCardProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const completionPending = useRef(false);
  const pendingRaw = useRef<string | null>(null);
  const lastPointerType = useRef("mouse");
  const suppressClicksUntil = useRef(0);
  const [optimisticCompleted, setOptimisticCompleted] = useState(task.completed);
  const taskName = task.description || "Untitled task";
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: task.id,
    data: { task },
  });
  const setItemRef = useCallback(
    (element: HTMLDivElement | null) => {
      itemRef.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );

  useTooltip(itemRef, taskName);
  useEffect(() => {
    setOptimisticCompleted(task.completed);
    if (completionPending.current && pendingRaw.current !== null && task.raw !== pendingRaw.current) {
      completionPending.current = false;
      pendingRaw.current = null;
    }
  }, [task.completed, task.raw]);

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
    <motion.div
      className={`tasks-calendar-task${task.recurrence ? " has-recurrence" : ""}${optimisticCompleted ? " is-completed" : ""}${isDragging ? " is-dragging" : ""}`}
      data-priority={task.priority}
      layout="position"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        lastPointerType.current = event.pointerType;
      }}
      ref={setItemRef}
      transition={{ layout: layoutTransition }}
    >
      <input
        aria-description={`${optimisticCompleted ? "Reopen" : "Complete"} this task`}
        aria-labelledby={titleId}
        checked={optimisticCompleted}
        className="tasks-calendar-checkbox"
        onChange={(event) => {
          if (completionPending.current) {
            event.currentTarget.checked = optimisticCompleted;
            return;
          }

          const completed = !optimisticCompleted;
          completionPending.current = true;
          pendingRaw.current = task.raw;
          setOptimisticCompleted(completed);
          onCompletionChange(task.id, completed, task.raw);
          if (completed) playCompletionFeedback(event.currentTarget, completesDay);
          void plugin.toggleTask(task).then((updated) => {
            if (!updated) {
              setOptimisticCompleted(!completed);
              onCompletionChange(task.id, null);
              completionPending.current = false;
              pendingRaw.current = null;
            }
          });
        }}
        onClick={(event) => event.stopPropagation()}
        type="checkbox"
      />
      <button
        className="tasks-calendar-task-title"
        id={titleId}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        {taskName}
      </button>
      {task.recurrence ? (
        <RecurrenceIcon
          recurrence={task.recurrence}
          onPreviewEnd={() => onRecurrencePreview(null)}
          onPreviewStart={() => onRecurrencePreview(task)}
        />
      ) : null}
      {showSource ? <TaskSourceButton plugin={plugin} task={task} /> : null}
      {meta}
    </motion.div>
  );
}

function RecurrenceIcon({
  recurrence,
  onPreviewEnd,
  onPreviewStart,
}: {
  recurrence: string;
  onPreviewEnd: () => void;
  onPreviewStart: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    setIcon(ref.current, "repeat-2");
    setTooltip(ref.current, `Repeats: ${recurrence}`, tooltipOptions);
  }, [recurrence]);

  return (
    <span
      className="tasks-calendar-recurrence"
      onBlur={onPreviewEnd}
      onFocus={onPreviewStart}
      onPointerEnter={onPreviewStart}
      onPointerLeave={onPreviewEnd}
      ref={ref}
      tabIndex={0}
    />
  );
}

function TaskSourceButton({ plugin, task }: { plugin: TasksCalendarPlugin; task: CalendarTask }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) setTooltip(ref.current, `Open ${task.path}`, tooltipOptions);
  }, [task.path]);

  return (
    <button className="tasks-calendar-task-source" onClick={() => void plugin.openTask(task)} ref={ref} type="button">
      {task.path.replace(/\.md$/i, "").split("/").pop()}
    </button>
  );
}

function useTooltip(ref: RefObject<HTMLElement | null>, text: string): void {
  useEffect(() => {
    if (ref.current) setTooltip(ref.current, text, tooltipOptions);
  }, [ref, text]);
}
