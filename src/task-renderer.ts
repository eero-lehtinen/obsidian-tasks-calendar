import { Menu, setIcon, setTooltip } from "obsidian";
import { recurrenceDateKeys } from "./recurrence";
import type TasksCalendarPlugin from "./main";
import type { CalendarTask } from "./types";

interface VisibleDateRange {
  start: string;
  end: string;
}

export class CalendarTaskRenderer {
  private taskElementId = 0;
  private draggedTask: CalendarTask | null = null;
  private visibleDateRange: VisibleDateRange | null = null;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: TasksCalendarPlugin,
    private readonly calendarInstanceId: number,
    private readonly taskDate: (task: CalendarTask) => string | null,
  ) {}

  beginRender(visibleDateRange: VisibleDateRange): void {
    this.taskElementId = 0;
    this.visibleDateRange = visibleDateRange;
  }

  attachDayInteractions(cell: HTMLElement, date: string): void {
    cell.addEventListener("dragover", (event) => {
      if (!this.draggedTask) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.clearDropTargets();
      cell.addClass("is-drop-target");
    });
    cell.addEventListener("drop", (event) => {
      if (!this.draggedTask) return;
      event.preventDefault();
      const draggedTask = this.draggedTask;
      this.draggedTask = null;
      this.clearDropTargets();
      void this.plugin.rescheduleTask(draggedTask, date);
    });
    cell.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".tasks-calendar-task, .tasks-calendar-more, button, input"))
        return;
      event.preventDefault();
      void this.plugin.createTask(date);
    });
  }

  renderTask(list: HTMLElement, task: CalendarTask, showSource: boolean): HTMLElement {
    const taskName = task.description || "Untitled task";
    const tooltipOptions = { placement: "bottom" as const, delay: 200 };
    const item = list.createDiv({
      cls: `tasks-calendar-task${task.completed ? " is-completed" : ""}`,
      attr: { "data-priority": task.priority },
    });
    let lastPointerType = "mouse";
    let suppressClicksUntil = 0;
    item.addEventListener("pointerdown", (event) => {
      lastPointerType = event.pointerType;
    });
    item.draggable = true;
    item.addEventListener("dragstart", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(".tasks-calendar-checkbox, .tasks-calendar-recurrence, .tasks-calendar-task-source")
      ) {
        event.preventDefault();
        return;
      }
      this.draggedTask = task;
      item.addClass("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
      }
    });
    item.addEventListener("dragend", () => {
      this.draggedTask = null;
      item.removeClass("is-dragging");
      this.clearDropTargets();
    });
    item.addEventListener("click", (event) => {
      if (performance.now() < suppressClicksUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".tasks-calendar-checkbox, .tasks-calendar-task-source"))
        return;
      const isTouch = lastPointerType === "touch";
      lastPointerType = "mouse";
      if (isTouch) {
        event.preventDefault();
        this.showTaskActions(task, { x: event.clientX, y: event.clientY });
        return;
      }
      void this.plugin.editTask(task);
    });
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (lastPointerType === "touch") {
        lastPointerType = "mouse";
        suppressClicksUntil = performance.now() + 750;
        this.showTaskActions(task, { x: event.clientX, y: event.clientY });
        return;
      }
      void this.plugin.openTask(task);
    });
    setTooltip(item, taskName, tooltipOptions);

    const checkbox = item.createEl("input", { type: "checkbox", cls: "tasks-calendar-checkbox" });
    checkbox.checked = task.completed;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => void this.plugin.toggleTask(task));

    const title = item.createEl("button", { text: taskName, cls: "tasks-calendar-task-title" });
    const titleId = `tasks-calendar-${this.calendarInstanceId}-task-${this.taskElementId}`;
    this.taskElementId += 1;
    title.id = titleId;
    checkbox.setAttr("aria-labelledby", titleId);
    checkbox.setAttr("aria-description", `${task.completed ? "Reopen" : "Complete"} this task`);

    if (task.recurrence) {
      const recurrenceIcon = item.createSpan({ cls: "tasks-calendar-recurrence" });
      setIcon(recurrenceIcon, "repeat-2");
      setTooltip(recurrenceIcon, `Repeats: ${task.recurrence}`, tooltipOptions);
      recurrenceIcon.tabIndex = 0;
      recurrenceIcon.addEventListener("pointerenter", () => this.showRecurrencePreview(task));
      recurrenceIcon.addEventListener("pointerleave", () => this.clearRecurrencePreview());
      recurrenceIcon.addEventListener("focus", () => this.showRecurrencePreview(task));
      recurrenceIcon.addEventListener("blur", () => this.clearRecurrencePreview());
    }

    if (showSource) {
      const source = item.createEl("button", {
        text: task.path.replace(/\.md$/i, "").split("/").pop(),
        cls: "tasks-calendar-task-source",
        attr: { type: "button" },
      });
      setTooltip(source, `Open ${task.path}`, tooltipOptions);
      source.addEventListener("click", () => void this.plugin.openTask(task));
    }
    return item;
  }

  private showTaskActions(task: CalendarTask, position: { x: number; y: number }): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("Edit task")
        .setIcon("pencil")
        .onClick(() => void this.plugin.editTask(task)),
    );
    menu.addItem((item) =>
      item
        .setTitle("Open source")
        .setIcon("file-text")
        .onClick(() => void this.plugin.openTask(task)),
    );
    menu.showAtPosition(position);
  }

  private showRecurrencePreview(task: CalendarTask): void {
    this.clearRecurrencePreview();
    if (!task.recurrence || !this.visibleDateRange) return;
    const baseDate = this.taskDate(task);
    if (!baseDate) return;
    const dates = recurrenceDateKeys(task.recurrence, baseDate, this.visibleDateRange.start, this.visibleDateRange.end);
    for (const day of Array.from(this.containerEl.querySelectorAll<HTMLElement>(".tasks-calendar-day[data-date]"))) {
      day.toggleClass("is-recurrence-preview", dates.has(day.dataset.date ?? ""));
    }
  }

  private clearRecurrencePreview(): void {
    for (const day of Array.from(this.containerEl.querySelectorAll(".tasks-calendar-day.is-recurrence-preview"))) {
      day.removeClass("is-recurrence-preview");
    }
  }

  private clearDropTargets(): void {
    for (const day of Array.from(this.containerEl.querySelectorAll(".tasks-calendar-day.is-drop-target"))) {
      day.removeClass("is-drop-target");
    }
  }
}
