import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { type App, Component, MarkdownRenderer, setIcon, setTooltip } from "obsidian";
import type { ChangeEventHandler, CSSProperties, KeyboardEventHandler } from "react";
import { useEffect, useRef } from "react";
import type { CalendarTask } from "../types";
import { handleTaskLinkClick } from "./link-navigation";

const tooltipOptions = { placement: "bottom" as const, delay: 200 };

export interface TaskDragBinding {
  attributes: DraggableAttributes;
  isDragging: boolean;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
}

const priorityMarker = /(?:^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=\s|$)/u;
const priorityMarkers = /(?:^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=\s|$)/gu;

const priorityLabels = {
  highest: "Highest priority",
  high: "High priority",
  medium: "Medium priority",
  normal: "Normal priority",
  low: "Low priority",
  lowest: "Lowest priority",
} as const;

export function getVisiblePriority(task: CalendarTask): CalendarTask["priority"] | null {
  return priorityMarker.test(task.description) ? task.priority : null;
}

export function getTaskName(task: CalendarTask): string {
  return task.description.replace(priorityMarkers, " ").replace(/\s+/g, " ").trim() || "Untitled task";
}

export function PriorityIcon({ priority }: { priority: CalendarTask["priority"] }) {
  const pointsUp = priority === "highest" || priority === "high" || priority === "medium";
  const isDouble = priority === "high" || priority === "lowest";
  return (
    <span aria-label={priorityLabels[priority]} className="tasks-calendar-priority" data-level={priority} role="img">
      <svg aria-hidden="true" viewBox="0 0 14 14">
        {priority === "highest" ? (
          <>
            <path d="M1.3 11.2 7 2 12.7 11.2Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5.1 9.4 7 6.3 8.9 9.4Z" />
          </>
        ) : isDouble ? (
          pointsUp ? (
            <>
              <path d="M2.2 7 7 2.2 11.8 7Z" />
              <path d="M2.2 12.2 7 7.4 11.8 12.2Z" />
            </>
          ) : (
            <>
              <path d="M2.2 1.8 7 6.6 11.8 1.8Z" />
              <path d="M2.2 7 7 11.8 11.8 7Z" />
            </>
          )
        ) : pointsUp ? (
          <path d="M1.8 10.5 7 3.3 12.2 10.5Z" />
        ) : (
          <path d="M1.8 3.5 7 10.7 12.2 3.5Z" />
        )}
      </svg>
    </span>
  );
}

export function TaskCheckbox({
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

export function TaskTitle({
  app,
  drag,
  onEdit,
  sourcePath,
  taskName,
  titleId,
}: {
  app: App;
  drag?: TaskDragBinding;
  onEdit?: () => void;
  sourcePath: string;
  taskName: string;
  titleId?: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const keyboardOnKeyDown = drag?.listeners?.onKeyDown;
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if ((event.target as Element).closest("a")) return;

    keyboardOnKeyDown?.(event);
    if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onEdit?.();
    }
  };

  useEffect(() => {
    if (!contentRef.current) return;

    const component = new Component();
    component.load();
    contentRef.current.replaceChildren();
    void MarkdownRenderer.renderMarkdown(taskName, contentRef.current, sourcePath, component);
    return () => component.unload();
  }, [sourcePath, taskName]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: A native button cannot contain the Markdown links rendered in the title.
    <div
      {...(titleId ? { id: titleId } : { "aria-hidden": true })}
      className="tasks-calendar-task-title"
      {...(drag ? { ...drag.attributes, ref: drag.setActivatorNodeRef } : {})}
      onAuxClick={(event) => handleTaskLinkClick(event.nativeEvent, app.workspace, sourcePath)}
      onClick={(event) => handleTaskLinkClick(event.nativeEvent, app.workspace, sourcePath)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if ((event.target as Element).closest("a")) event.stopPropagation();
      }}
      role="button"
      tabIndex={titleId ? 0 : -1}
    >
      <div className="tasks-calendar-task-title-content" ref={contentRef}>
        {taskName}
      </div>
    </div>
  );
}

export function RecurrenceIcon({
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
