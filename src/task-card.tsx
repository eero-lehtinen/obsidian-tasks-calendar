import { useDraggable } from "@dnd-kit/core";
import { Menu, setIcon, setTooltip } from "obsidian";
import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import { playCompletionFeedback } from "./completion-feedback";
import type TasksCalendarPlugin from "./main";
import type { CalendarTask } from "./types";

interface TaskCardProps {
  plugin: TasksCalendarPlugin;
  meta?: ReactNode;
  showSource: boolean;
  task: CalendarTask;
  titleId: string;
  onRecurrencePreview: (task: CalendarTask | null) => void;
}

const tooltipOptions = { placement: "bottom" as const, delay: 200 };

export function TaskCard({ plugin, meta, showSource, task, titleId, onRecurrencePreview }: TaskCardProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const lastPointerType = useRef("mouse");
  const suppressClicksUntil = useRef(0);
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
      lastPointerType.current = "mouse";
      suppressClicksUntil.current = performance.now() + 750;
      showTaskActions(plugin, task, { x: event.clientX, y: event.clientY });
      return;
    }
    void plugin.openTask(task);
  };

  return (
    <div
      className={`tasks-calendar-task${task.completed ? " is-completed" : ""}${isDragging ? " is-dragging" : ""}`}
      data-priority={task.priority}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        lastPointerType.current = event.pointerType;
      }}
      ref={setItemRef}
    >
      <input
        aria-description={`${task.completed ? "Reopen" : "Complete"} this task`}
        aria-labelledby={titleId}
        checked={task.completed}
        className="tasks-calendar-checkbox"
        onChange={(event) => {
          if (!task.completed) playCompletionFeedback(event.currentTarget);
          void plugin.toggleTask(task);
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
    </div>
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

function showTaskActions(plugin: TasksCalendarPlugin, task: CalendarTask, position: { x: number; y: number }): void {
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle("Edit task")
      .setIcon("pencil")
      .onClick(() => void plugin.editTask(task)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Open source")
      .setIcon("file-text")
      .onClick(() => void plugin.openTask(task)),
  );
  menu.showAtPosition(position);
}
