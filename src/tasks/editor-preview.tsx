import type { App } from "obsidian";
import type { CSSProperties } from "react";
import type { CalendarTask } from "../types";
import type { TaskTextPosition } from "./editor-caret";
import { getTaskName, getVisiblePriority, PriorityIcon, RecurrenceIcon, TaskCheckbox, TaskTitle } from "./item-content";

export function TaskEditorPreview({
  app,
  completedOpacity,
  task,
  onCompletionChange,
  onEdit,
}: {
  app: App;
  completedOpacity: number;
  task: CalendarTask;
  onCompletionChange: (completed: boolean) => void;
  onEdit: (position?: TaskTextPosition) => void;
}) {
  const priority = getVisiblePriority(task);
  const titleId = "tasks-calendar-editor-preview-title";
  return (
    <div
      className={`tasks-calendar-task${priority ? " has-priority" : ""}${task.recurrence ? " has-recurrence" : ""}${task.completed ? " is-completed" : ""}`}
      data-priority={task.priority}
      style={{ "--tasks-calendar-completed-opacity": String(completedOpacity) } as CSSProperties}
    >
      <TaskCheckbox
        checked={task.completed}
        onChange={(event) => onCompletionChange(event.currentTarget.checked)}
        titleId={titleId}
      />
      <TaskTitle
        editOnClick
        app={app}
        onEdit={onEdit}
        sourcePath={task.path}
        taskName={getTaskName(task)}
        titleId={titleId}
      />
      {priority ? <PriorityIcon priority={priority} /> : null}
      {task.recurrence ? <RecurrenceIcon interactive={false} recurrence={task.recurrence} /> : null}
    </div>
  );
}
