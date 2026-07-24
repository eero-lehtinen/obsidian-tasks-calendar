import { MarkdownRenderChild, Menu, Platform, setIcon } from "obsidian";
import { calendarDays, fromDateKey, moveAnchor, titleForRange, toDateKey } from "./date-utils";
import { compileQuery } from "./query";
import type TasksCalendarPlugin from "./main";
import type { CalendarMode, CalendarState, CalendarTask } from "./types";

export class TasksCalendarRenderer extends MarkdownRenderChild {
  private state: CalendarState;
  private search = "";
  private queryOpen = false;

  constructor(
    containerEl: HTMLElement,
    private readonly plugin: TasksCalendarPlugin,
    initial: Partial<CalendarState> = {}
  ) {
    super(containerEl);
    this.state = {
      mode: initial.mode ?? plugin.settings.defaultView,
      anchor: initial.anchor ?? toDateKey(new Date()),
      query: initial.query ?? plugin.settings.defaultQuery,
      showCompleted: initial.showCompleted ?? plugin.settings.showCompleted
    };
  }

  onload(): void {
    this.containerEl.addClass("tasks-calendar");
    this.registerEvent(this.plugin.taskStore.on("tasks-calendar:changed", () => this.render()));
    this.render();
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
    this.iconButton(navigation, "chevron-left", "Previous", () => this.navigate(-1));
    navigation.createEl("button", { text: "Today", cls: "tasks-calendar-today-button" })
      .addEventListener("click", () => {
        this.state.anchor = toDateKey(new Date());
        this.render();
      });
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
      value: this.search
    });
    search.setAttr("aria-label", "Search tasks");
    search.addEventListener("input", () => {
      this.search = search.value;
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
    root.querySelector(".tasks-calendar-grid")?.remove();
    root.querySelector(".tasks-calendar-error")?.remove();
    const query = compileQuery(this.state.query);
    if (query.error) {
      root.createDiv({ text: query.error, cls: "tasks-calendar-error" });
    }

    const anchor = fromDateKey(this.state.anchor);
    const days = calendarDays(anchor, this.state.mode, this.plugin.settings.weekStartsOn);
    const today = toDateKey(new Date());
    const tasksByDate = new Map<string, CalendarTask[]>();
    const search = this.search.trim().toLowerCase();
    let visibleTasks = 0;

    for (const task of this.plugin.taskStore.getTasks()) {
      if ((!this.state.showCompleted && task.completed) || (query.error ? true : !query.predicate(task))) continue;
      if (search && !`${task.description} ${task.path} ${task.tags.join(" ")}`.toLowerCase().includes(search)) continue;
      const key = this.taskDate(task, today);
      if (!key) continue;
      const bucket = tasksByDate.get(key) ?? [];
      bucket.push(task);
      tasksByDate.set(key, bucket);
      visibleTasks += 1;
    }

    const grid = root.createDiv({
      cls: `tasks-calendar-grid is-${this.state.mode}`,
      attr: { role: "grid", "aria-label": "Tasks calendar" }
    });
    for (const day of days.slice(0, 7)) {
      grid.createDiv({
        text: new Intl.DateTimeFormat(undefined, { weekday: this.state.mode === "week" ? "long" : "short" }).format(day),
        cls: "tasks-calendar-weekday",
        attr: { role: "columnheader" }
      });
    }

    for (const day of days) {
      const key = toDateKey(day);
      const tasks = tasksByDate.get(key) ?? [];
      tasks.sort(compareTasks);
      this.renderDay(grid, day, key, tasks, today, anchor);
    }
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
  ): void {
    const isOutside = this.state.mode === "month" && day.getMonth() !== anchor.getMonth();
    const cell = grid.createDiv({
      cls: [
        "tasks-calendar-day",
        key === today ? "is-today" : "",
        isOutside ? "is-outside" : ""
      ].filter(Boolean).join(" "),
      attr: { role: "gridcell", "aria-label": `${day.toDateString()}, ${tasks.length} tasks` }
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
      this.render();
    });
    if (tasks.length > 0) heading.createSpan({ text: String(tasks.length), cls: "tasks-calendar-day-count" });

    const list = cell.createDiv({ cls: "tasks-calendar-task-list" });
    const maximum = this.state.mode === "month" ? this.plugin.settings.compactMonthTasks : Number.POSITIVE_INFINITY;
    for (const task of tasks.slice(0, maximum)) this.renderTask(list, task);
    if (tasks.length > maximum) {
      const more = list.createEl("button", {
        text: `+${tasks.length - maximum} more`,
        cls: "tasks-calendar-more"
      });
      more.addEventListener("click", () => {
        this.state.anchor = key;
        this.state.mode = "week";
        this.render();
      });
    }
  }

  private renderTask(list: HTMLElement, task: CalendarTask): void {
    const item = list.createDiv({
      cls: `tasks-calendar-task${task.completed ? " is-completed" : ""}`,
      attr: { "data-priority": task.priority }
    });
    const checkbox = item.createEl("input", { type: "checkbox", cls: "tasks-calendar-checkbox" });
    checkbox.checked = task.completed;
    checkbox.setAttr("aria-label", `${task.completed ? "Reopen" : "Complete"} ${task.description}`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => void this.plugin.toggleTask(task));

    const title = item.createEl("button", { text: task.description || "Untitled task", cls: "tasks-calendar-task-title" });
    title.setAttr("title", `${task.description}\n${task.path}:${task.line + 1}`);
    title.addEventListener("click", () => void this.plugin.openTask(task));
    title.addEventListener("contextmenu", (event) => this.openTaskMenu(event, task));

    if (this.state.mode === "week") {
      item.createSpan({ text: task.path.replace(/\.md$/i, "").split("/").pop(), cls: "tasks-calendar-task-source" });
    }
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

  private navigate(direction: -1 | 1): void {
    this.state.anchor = toDateKey(moveAnchor(fromDateKey(this.state.anchor), this.state.mode, direction));
    this.render();
  }

  private modeButton(parent: HTMLElement, label: string, mode: CalendarMode): void {
    const button = parent.createEl("button", {
      text: label,
      cls: this.state.mode === mode ? "is-active" : ""
    });
    button.addEventListener("click", () => {
      this.state.mode = mode;
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
}

function compareTasks(left: CalendarTask, right: CalendarTask): number {
  if (left.completed !== right.completed) return left.completed ? 1 : -1;
  const priorities = ["highest", "high", "normal", "low", "lowest"];
  return priorities.indexOf(left.priority) - priorities.indexOf(right.priority) ||
    left.description.localeCompare(right.description);
}
