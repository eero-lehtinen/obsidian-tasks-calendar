import { MarkdownRenderChild, Menu, Platform, setIcon, setTooltip } from "obsidian";
import { calendarDays, fromDateKey, isoWeekNumber, moveAnchor, titleForRange, toDateKey } from "./date-utils";
import { compileQuery } from "./query";
import { recurrenceDateKeys } from "./recurrence";
import type TasksCalendarPlugin from "./main";
import type { CalendarMode, CalendarState, CalendarTask } from "./types";

let nextCalendarInstanceId = 0;

interface MonthCellLayout {
  cell: HTMLElement;
  list: HTMLElement;
  taskElements: HTMLElement[];
  moreButton: HTMLButtonElement;
}

export class TasksCalendarRenderer extends MarkdownRenderChild {
  private state: CalendarState;
  private queryOpen = false;
  private readonly calendarInstanceId = nextCalendarInstanceId++;
  private taskElementId = 0;
  private visibleDateRange: { start: string; end: string } | null = null;
  private gridResizeObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;
  private draggedTask: CalendarTask | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: TasksCalendarPlugin,
    initial: Partial<CalendarState> = {},
    private readonly onStateChange?: (state: CalendarState) => void
  ) {
    super(containerEl);
    this.state = {
      mode: initial.mode ?? plugin.settings.defaultView,
      anchor: initial.anchor ?? toDateKey(new Date()),
      query: initial.query ?? plugin.settings.defaultQuery,
      showCompleted: initial.showCompleted ?? plugin.settings.showCompleted,
      search: initial.search ?? "",
      weekHeight: initial.weekHeight ?? null
    };
  }

  onload(): void {
    this.containerEl.addClass("tasks-calendar");
    this.registerEvent(this.plugin.taskStore.on("tasks-calendar:changed", () => this.render()));
    this.render();
  }

  onunload(): void {
    this.gridResizeObserver?.disconnect();
    this.gridResizeObserver = null;
    if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
  }

  refresh(): void {
    this.containerEl.style.setProperty("--tasks-calendar-completed-opacity", String(this.plugin.settings.completedOpacity));
    this.render();
  }

  getState(): CalendarState {
    return { ...this.state };
  }

  setState(state: Partial<CalendarState>): void {
    this.state = { ...this.state, ...state };
    this.notifyStateChange();
    this.render();
  }

  render(): void {
    const root = this.containerEl;
    root.empty();
    root.style.setProperty("--tasks-calendar-completed-opacity", String(this.plugin.settings.completedOpacity));
    this.renderToolbar(root);
    if (this.queryOpen) this.renderQueryEditor(root);
    this.renderCalendar(root);
  }

  private renderToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: "tasks-calendar-toolbar" });
    const navigation = toolbar.createDiv({ cls: "tasks-calendar-navigation" });
    navigation.createEl("button", { text: "Today", cls: "tasks-calendar-today-button" })
      .addEventListener("click", () => {
        this.state.anchor = toDateKey(new Date());
        this.notifyStateChange();
        this.render();
      });
    this.iconButton(navigation, "chevron-left", "Previous", () => this.navigate(-1));
    this.iconButton(navigation, "chevron-right", "Next", () => this.navigate(1));

    toolbar.createEl("h2", {
      text: titleForRange(fromDateKey(this.state.anchor), this.state.mode, this.plugin.settings.weekStartsOn),
      cls: "tasks-calendar-title"
    });

    const controls = toolbar.createDiv({ cls: "tasks-calendar-controls" });
    const search = controls.createEl("input", {
      type: "search",
      placeholder: "Search tasks",
      cls: "tasks-calendar-search",
      value: this.state.search
    });
    search.setAttr("aria-label", "Search tasks");
    search.addEventListener("input", () => {
      this.state.search = search.value;
      this.notifyStateChange();
      this.renderCalendar(root);
    });

    const filterButton = this.iconButton(controls, "list-filter", "Edit task filters", () => {
      this.queryOpen = !this.queryOpen;
      this.render();
    });
    if (this.state.query.trim()) filterButton.addClass("is-active");

    this.iconButton(
      controls,
      this.state.showCompleted ? "eye" : "eye-off",
      this.state.showCompleted ? "Hide completed tasks" : "Show completed tasks",
      () => {
        this.state.showCompleted = !this.state.showCompleted;
        this.notifyStateChange();
        this.render();
      }
    );

    const modeSwitch = controls.createDiv({ cls: "tasks-calendar-mode-switch" });
    this.modeButton(modeSwitch, "Month", "month");
    this.modeButton(modeSwitch, "Week", "week");
  }

  private renderQueryEditor(root: HTMLElement): void {
    const panel = root.createDiv({ cls: "tasks-calendar-query-panel" });
    const label = panel.createEl("label", { text: "Task filters" });
    label.createSpan({ text: "One Tasks-style instruction per line" });
    const textarea = panel.createEl("textarea", {
      cls: "tasks-calendar-query",
      placeholder: "not done\npath includes Projects\nscheduled before tomorrow",
      text: this.state.query
    });
    textarea.rows = 3;
    textarea.addEventListener("input", () => {
      this.state.query = textarea.value;
      this.notifyStateChange();
      this.renderCalendar(root);
    });
    panel.createEl("a", {
      text: "Tasks query reference",
      href: "https://publish.obsidian.md/tasks/Queries/Filters",
      cls: "tasks-calendar-query-help"
    });
  }

  private renderCalendar(root: HTMLElement): void {
    const startedAt = performance.now();
    this.gridResizeObserver?.disconnect();
    this.gridResizeObserver = null;
    if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
    this.taskElementId = 0;
    root.querySelector(".tasks-calendar-grid")?.remove();
    root.querySelector(".tasks-calendar-error")?.remove();
    root.querySelector(".tasks-calendar-late-tasks")?.remove();
    const query = compileQuery(this.state.query);
    if (query.error) {
      root.createDiv({ text: query.error, cls: "tasks-calendar-error" });
    }

    const anchor = fromDateKey(this.state.anchor);
    const days = calendarDays(anchor, this.state.mode, this.plugin.settings.weekStartsOn);
    this.visibleDateRange = {
      start: toDateKey(days[0]),
      end: toDateKey(days[days.length - 1])
    };
    const today = toDateKey(new Date());
    const todayViewStart = toDateKey(
      calendarDays(new Date(), this.state.mode, this.plugin.settings.weekStartsOn)[0]
    );
    const visibleDateKeys = new Set(days.map(toDateKey));
    const tasksByDate = new Map<string, CalendarTask[]>();
    const lateTasks: CalendarTask[] = [];
    const search = this.state.search.trim().toLowerCase();
    let visibleTasks = 0;

    for (const task of this.plugin.taskStore.getTasks()) {
      if ((!this.state.showCompleted && task.completed) || (query.error ? true : !query.predicate(task))) continue;
      if (search && !`${task.description} ${task.path} ${task.tags.join(" ")}`.toLowerCase().includes(search)) continue;
      const key = this.taskDate(task, today);
      if (!key) continue;
      if (!task.completed && key < todayViewStart && !visibleDateKeys.has(key)) {
        lateTasks.push(task);
      }
      const bucket = tasksByDate.get(key) ?? [];
      bucket.push(task);
      tasksByDate.set(key, bucket);
      visibleTasks += 1;
    }

    const grid = root.createDiv({
      cls: `tasks-calendar-grid is-${this.state.mode}`,
      attr: { role: "grid", "aria-label": "Tasks calendar" }
    });
    if (this.state.mode === "week") {
      if (this.state.weekHeight !== null) grid.style.height = `${this.state.weekHeight}px`;
      this.gridResizeObserver = new ResizeObserver((entries) => {
        const height = Math.round(entries[0]?.contentRect.height ?? 0);
        if (height > 0 && Math.abs(height - (this.state.weekHeight ?? 0)) > 1) {
          this.state.weekHeight = height;
          this.notifyStateChange();
        }
      });
      this.gridResizeObserver.observe(grid);
    }
    grid.createDiv({
      text: "Wk",
      cls: "tasks-calendar-weekday tasks-calendar-week-number-header",
      attr: { role: "columnheader", "aria-label": "ISO week number" }
    });
    for (const day of days.slice(0, 7)) {
      grid.createDiv({
        text: new Intl.DateTimeFormat(undefined, { weekday: this.state.mode === "week" ? "long" : "short" }).format(day),
        cls: "tasks-calendar-weekday",
        attr: { role: "columnheader" }
      });
    }

    const monthLayouts: MonthCellLayout[] = [];
    for (const [index, day] of days.entries()) {
      if (index % 7 === 0) {
        const week = isoWeekNumber(days[index + 3] ?? day);
        grid.createDiv({
          text: String(week),
          cls: "tasks-calendar-week-number",
          attr: { role: "rowheader", "aria-label": `Week ${week}` }
        });
      }
      const key = toDateKey(day);
      const tasks = tasksByDate.get(key) ?? [];
      tasks.sort(compareTasks);
      const layout = this.renderDay(grid, day, key, tasks, today, anchor);
      if (layout) monthLayouts.push(layout);
    }
    if (this.state.mode === "month") {
      const fit = () => {
        for (const layout of monthLayouts) this.fitMonthCell(layout);
      };
      this.layoutFrame = window.requestAnimationFrame(() => {
        this.layoutFrame = null;
        fit();
      });
      this.gridResizeObserver = new ResizeObserver(fit);
      this.gridResizeObserver.observe(grid);
    }
    this.renderLateTasks(root, lateTasks, today);
    this.plugin.performanceMonitor.record("render.calendar", performance.now() - startedAt, {
      indexedTasks: this.plugin.taskStore.getTasks().length,
      visibleTasks,
      days: days.length
    });
  }

  private renderDay(
    grid: HTMLElement,
    day: Date,
    key: string,
    tasks: CalendarTask[],
    today: string,
    anchor: Date
  ): MonthCellLayout | null {
    const isOutside = this.state.mode === "month" && day.getMonth() !== anchor.getMonth();
    const cell = grid.createDiv({
      cls: [
        "tasks-calendar-day",
        key === today ? "is-today" : "",
        isOutside ? "is-outside" : ""
      ].filter(Boolean).join(" "),
      attr: {
        role: "gridcell",
        "aria-label": `${day.toDateString()}, ${tasks.length} tasks`,
        "data-date": key
      }
    });
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
      void this.plugin.rescheduleTask(draggedTask, key);
    });
    cell.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(".tasks-calendar-task, .tasks-calendar-more, button, input")
      ) return;
      event.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle(`Create task on ${key}`)
        .setIcon("circle-plus")
        .onClick(() => void this.plugin.createTask(key)));
      menu.showAtMouseEvent(event);
    });
    const heading = cell.createDiv({ cls: "tasks-calendar-day-heading" });
    const dayButton = heading.createEl("button", {
      text: this.state.mode === "week"
        ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day)
        : String(day.getDate()),
      cls: "tasks-calendar-day-number"
    });
    dayButton.addEventListener("click", () => {
      this.state.anchor = key;
      this.state.mode = "week";
      this.notifyStateChange();
      this.render();
    });
    if (tasks.length > 0) heading.createSpan({ text: String(tasks.length), cls: "tasks-calendar-day-count" });

    const list = cell.createDiv({ cls: "tasks-calendar-task-list" });
    const taskElements = tasks.map((task) => this.renderTask(list, task));
    if (this.state.mode !== "month" || tasks.length === 0) return null;

    const moreButton = list.createEl("button", {
      text: "",
      cls: "tasks-calendar-more"
    });
    moreButton.hidden = true;
    moreButton.addEventListener("click", () => {
      this.state.anchor = key;
      this.state.mode = "week";
      this.notifyStateChange();
      this.render();
    });
    return { cell, list, taskElements, moreButton };
  }

  private renderTask(
    list: HTMLElement,
    task: CalendarTask,
    showSource = this.state.mode === "week"
  ): HTMLElement {
    const taskName = task.description || "Untitled task";
    const tooltipOptions = { placement: "bottom" as const, delay: 200 };
    const item = list.createDiv({
      cls: `tasks-calendar-task${task.completed ? " is-completed" : ""}`,
      attr: { "data-priority": task.priority }
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
    item.addEventListener("contextmenu", (event) => this.openTaskMenu(event, task));
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
    title.addEventListener("click", () => void this.plugin.openTask(task));

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
        attr: { type: "button" }
      });
      setTooltip(source, `Open ${task.path}`, tooltipOptions);
      source.addEventListener("click", () => void this.plugin.openTask(task));
    }
    return item;
  }

  private renderLateTasks(root: HTMLElement, tasks: CalendarTask[], today: string): void {
    if (tasks.length === 0) return;
    tasks.sort((left, right) => {
      const leftDate = this.taskDate(left, today) ?? "";
      const rightDate = this.taskDate(right, today) ?? "";
      return leftDate.localeCompare(rightDate) || left.description.localeCompare(right.description);
    });

    const panel = root.createDiv({ cls: "tasks-calendar-late-tasks" });
    const header = panel.createDiv({ cls: "tasks-calendar-late-header" });
    header.createEl("h3", { text: "Very late tasks" });
    header.createSpan({ text: String(tasks.length), cls: "tasks-calendar-late-count" });
    const list = panel.createDiv({ cls: "tasks-calendar-task-list tasks-calendar-late-list" });
    for (const task of tasks) {
      const item = this.renderTask(list, task, false);
      const date = this.taskDate(task, today);
      item.createSpan({
        text: `${date ?? "No date"} · ${task.path.replace(/\.md$/i, "")}`,
        cls: "tasks-calendar-late-meta"
      });
    }
  }

  private fitMonthCell(layout: MonthCellLayout): void {
    const { cell, list, taskElements, moreButton } = layout;
    for (const task of taskElements) task.hidden = false;
    moreButton.hidden = true;

    const listTop = list.offsetTop - cell.offsetTop;
    const availableHeight = Math.max(0, cell.clientHeight - listTop - 5);
    if (list.scrollHeight <= availableHeight) return;

    moreButton.hidden = false;
    const moreHeight = moreButton.getBoundingClientRect().height;
    const taskHeightLimit = Math.max(0, availableHeight - moreHeight);
    let usedHeight = 0;
    let visibleCount = 0;
    let overflowed = false;
    for (const task of taskElements) {
      const height = task.getBoundingClientRect().height;
      const fits = !overflowed && usedHeight + height <= taskHeightLimit;
      task.hidden = !fits;
      if (fits) {
        usedHeight += height;
        visibleCount += 1;
      } else {
        overflowed = true;
      }
    }

    const hiddenCount = taskElements.length - visibleCount;
    moreButton.textContent = `+${hiddenCount} more`;
    moreButton.hidden = hiddenCount === 0;
  }

  private openTaskMenu(event: MouseEvent, task: CalendarTask): void {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => item.setTitle("Open source").setIcon("file-text").onClick(() => void this.plugin.openTask(task)));
    if (this.plugin.tasksApi) {
      menu.addItem((item) => item.setTitle("Edit task").setIcon("pencil").onClick(() => void this.plugin.editTask(task)));
    }
    menu.showAtMouseEvent(event);
  }

  private taskDate(task: CalendarTask, today: string): string | null {
    for (const field of this.plugin.settings.datePreference) {
      const date = task[field];
      if (date) return date;
    }
    return this.plugin.settings.undatedTasks === "today" ? today : null;
  }

  private showRecurrencePreview(task: CalendarTask): void {
    this.clearRecurrencePreview();
    if (!task.recurrence || !this.visibleDateRange) return;
    const baseDate = this.taskDate(task, toDateKey(new Date()));
    if (!baseDate) return;
    const dates = recurrenceDateKeys(
      task.recurrence,
      baseDate,
      this.visibleDateRange.start,
      this.visibleDateRange.end
    );
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

  private navigate(direction: -1 | 1): void {
    this.state.anchor = toDateKey(moveAnchor(fromDateKey(this.state.anchor), this.state.mode, direction));
    this.notifyStateChange();
    this.render();
  }

  private modeButton(parent: HTMLElement, label: string, mode: CalendarMode): void {
    const button = parent.createEl("button", {
      text: label,
      cls: this.state.mode === mode ? "is-active" : ""
    });
    button.addEventListener("click", () => {
      this.state.mode = mode;
      this.notifyStateChange();
      this.render();
    });
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, handler: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
    setIcon(button, icon);
    button.addEventListener("click", handler);
    if (!Platform.isMobile) button.setAttr("data-tooltip-position", "top");
    return button;
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getState());
  }
}

function compareTasks(left: CalendarTask, right: CalendarTask): number {
  if (left.completed !== right.completed) return left.completed ? 1 : -1;
  const priorities = ["highest", "high", "normal", "low", "lowest"];
  return priorities.indexOf(left.priority) - priorities.indexOf(right.priority) ||
    left.description.localeCompare(right.description);
}
