import { MarkdownView, Notice, normalizePath, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { TasksCalendarRenderer } from "./calendar/renderer";
import { TASKS_CALENDAR_VIEW, TasksCalendarView } from "./calendar/view";
import { PerformanceMonitor, PerformanceReportModal } from "./plugin/performance";
import { DEFAULT_SETTINGS, TasksCalendarSettingTab } from "./plugin/settings";
import { insertTaskAtTop } from "./tasks/file-content";
import { withoutTaskOrderKey } from "./tasks/order";
import { fallbackToggleLine, rescheduleTaskLine } from "./tasks/parser";
import { TaskStore } from "./tasks/store";
import type {
  CalendarMode,
  CalendarState,
  CalendarTask,
  DateField,
  TasksApiV1,
  TasksCalendarSettings,
  TasksPluginLike,
} from "./types";

interface ObsidianAppWithPlugins {
  plugins?: {
    plugins?: Record<string, TasksPluginLike>;
  };
}

export default class TasksCalendarPlugin extends Plugin {
  override settings: TasksCalendarSettings = DEFAULT_SETTINGS;
  taskStore!: TaskStore;
  readonly performanceMonitor = new PerformanceMonitor();
  private embeddedCalendars = new Set<TasksCalendarRenderer>();
  private stateSaveTimer: number | null = null;

  get tasksApi(): TasksApiV1 | null {
    const app = this.app as typeof this.app & ObsidianAppWithPlugins;
    return app.plugins?.plugins?.["obsidian-tasks-plugin"]?.apiV1 ?? null;
  }

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.taskStore = new TaskStore(this.app.vault, this.performanceMonitor);
    await this.taskStore.initialize();

    this.registerView(TASKS_CALENDAR_VIEW, (leaf) => new TasksCalendarView(leaf, this));
    this.addRibbonIcon("calendar-check", "Open Tasks Calendar", () => void this.activateView());
    this.addCommand({
      id: "open-tasks-calendar",
      name: "Open calendar",
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "open-tasks-calendar-week",
      name: "Open calendar in week view",
      callback: () => void this.activateView("week"),
    });
    this.addCommand({
      id: "open-tasks-calendar-day",
      name: "Open calendar in day view",
      callback: () => void this.activateView("day"),
    });
    this.addCommand({
      id: "show-performance-report",
      name: "Show performance report",
      callback: () => new PerformanceReportModal(this.app, this.performanceMonitor).open(),
    });
    this.addCommand({
      id: "reset-performance-measurements",
      name: "Reset performance measurements",
      callback: () => {
        this.performanceMonitor.reset();
        new Notice("Tasks Calendar performance measurements reset.");
      },
    });

    this.registerMarkdownCodeBlockProcessor("tasks-calendar", (source, element, context) => {
      const section = context.getSectionInfo(element);
      const stateKey = embeddedStateKey(context.sourcePath, section?.lineStart ?? -1, source);
      const savedState = this.settings.embeddedViewStates[stateKey];
      const renderer = new TasksCalendarRenderer(element, this, savedState ?? { query: source }, (state) =>
        this.rememberEmbeddedCalendarState(stateKey, state),
      );
      this.embeddedCalendars.add(renderer);
      context.addChild(renderer);
      renderer.register(() => this.embeddedCalendars.delete(renderer));
    });

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) this.taskStore.scheduleFile(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.taskStore.scheduleFile(file);
      }),
    );
    this.registerEvent(this.app.vault.on("delete", (file) => this.taskStore.removePath(file.path)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.taskStore.renamePath(file, oldPath);
      }),
    );
    this.addSettingTab(new TasksCalendarSettingTab(this.app, this));
  }

  override onunload(): void {
    if (this.stateSaveTimer !== null) {
      window.clearTimeout(this.stateSaveTimer);
      this.stateSaveTimer = null;
      void this.saveSettings();
    }
    this.app.workspace.detachLeavesOfType(TASKS_CALENDAR_VIEW);
  }

  async activateView(mode?: CalendarMode): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(TASKS_CALENDAR_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({
        type: TASKS_CALENDAR_VIEW,
        active: true,
        state: {
          ...(this.settings.lastViewState ?? {}),
          ...(mode ? { mode } : {}),
        },
      });
    } else if (mode) {
      await leaf.setViewState({ type: TASKS_CALENDAR_VIEW, active: true, state: { mode } });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async toggleTask(task: CalendarTask): Promise<boolean> {
    try {
      const replacement =
        this.tasksApi?.executeToggleTaskDoneCommand(task.raw, task.path) ?? fallbackToggleLine(task.raw);
      await this.taskStore.replaceTask(task, replacement);
      return true;
    } catch (error) {
      new Notice(`Could not update task: ${messageFrom(error)}`);
      return false;
    }
  }

  async editTask(task: CalendarTask): Promise<void> {
    const api = this.tasksApi;
    if (!api) {
      await this.openTask(task);
      return;
    }
    try {
      const replacement = await api.editTaskLineModal(task.raw);
      if (replacement && replacement !== task.raw) await this.taskStore.replaceTask(task, replacement);
    } catch (error) {
      new Notice(`Could not edit task: ${messageFrom(error)}`);
    }
  }

  async deleteTask(task: CalendarTask): Promise<void> {
    try {
      await this.taskStore.deleteTask(task);
      new Notice(`Deleted “${task.description || "Untitled task"}”.`);
    } catch (error) {
      new Notice(`Could not delete task: ${messageFrom(error)}`);
    }
  }

  async rescheduleTask(task: CalendarTask, date: string): Promise<void> {
    const field = this.calendarDateField(task);
    if (task[field] === date) return;
    try {
      const replacement = rescheduleTaskLine(task.raw, field, date);
      await this.taskStore.replaceTask(task, replacement);
      new Notice(`Rescheduled “${task.description || "Untitled task"}” to ${date}.`);
    } catch (error) {
      new Notice(`Could not reschedule task: ${messageFrom(error)}`);
    }
  }

  rememberTaskOrder(date: string, taskKeys: string[]): void {
    this.settings.taskOrder[date] = taskKeys;
    this.scheduleSettingsSave();
    this.refreshCalendars();
  }

  forgetTaskOrder(taskKey: string): void {
    this.settings.taskOrder = withoutTaskOrderKey(this.settings.taskOrder, taskKey);
    this.scheduleSettingsSave();
    this.refreshCalendars();
  }

  async createTask(date: string): Promise<void> {
    const api = this.tasksApi;
    if (!api) {
      new Notice("Enable the Tasks plugin to create tasks from the calendar.");
      return;
    }
    const configuredPath = this.settings.newTaskFile.trim();
    if (!configuredPath) {
      new Notice("Choose a new task file in Tasks Calendar settings.");
      return;
    }

    try {
      const taskLine = await api.createTaskLineModal();
      if (!taskLine) return;
      const datedTaskLine = rescheduleTaskLine(taskLine, "due", date);
      const path = normalizePath(
        configuredPath.toLowerCase().endsWith(".md") ? configuredPath : `${configuredPath}.md`,
      );
      await this.addTaskLineToTop(path, datedTaskLine);
      new Notice(`Created task in ${path}.`);
    } catch (error) {
      new Notice(`Could not create task: ${messageFrom(error)}`);
    }
  }

  async openTask(task: CalendarTask): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${task.path}`);
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file, { active: true, eState: { line: task.line } });
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.editor.setCursor({ line: task.line, ch: Math.max(0, task.raw.indexOf(task.description)) });
        view.editor.scrollIntoView(
          {
            from: { line: task.line, ch: 0 },
            to: { line: task.line, ch: task.raw.length },
          },
          true,
        );
      }
    } catch (error) {
      new Notice(`Could not open task: ${messageFrom(error)}`);
    }
  }

  refreshCalendars(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TASKS_CALENDAR_VIEW)) {
      if (leaf.view instanceof TasksCalendarView) leaf.view.refresh();
    }
    for (const calendar of this.embeddedCalendars) calendar.refresh();
  }

  rememberCalendarState(state: CalendarState): void {
    this.settings.lastViewState = state;
    this.scheduleSettingsSave();
  }

  rememberEmbeddedCalendarState(key: string, state: CalendarState): void {
    this.settings.embeddedViewStates[key] = state;
    this.scheduleSettingsSave();
  }

  private scheduleSettingsSave(): void {
    if (this.stateSaveTimer !== null) window.clearTimeout(this.stateSaveTimer);
    this.stateSaveTimer = window.setTimeout(() => {
      this.stateSaveTimer = null;
      void this.saveSettings();
    }, 250);
  }

  private calendarDateField(task: CalendarTask): DateField {
    return (
      this.settings.datePreference.find((field) => task[field] !== null) ??
      this.settings.datePreference[0] ??
      "scheduled"
    );
  }

  private async addTaskLineToTop(path: string, taskLine: string): Promise<void> {
    let file = this.app.vault.getAbstractFileByPath(path);
    if (file === null) {
      const parts = path.split("/").slice(0, -1);
      let folder = "";
      for (const part of parts) {
        folder = folder ? `${folder}/${part}` : part;
        if (this.app.vault.getAbstractFileByPath(folder) === null) {
          await this.app.vault.createFolder(folder);
        }
      }
      file = await this.app.vault.create(path, "");
    }
    if (!(file instanceof TFile)) throw new Error(`The configured path is not a Markdown file: ${path}`);

    await this.app.vault.process(file, (content) => insertTaskAtTop(content, taskLine));
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<TasksCalendarSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function embeddedStateKey(sourcePath: string, lineStart: number, source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${sourcePath}:${lineStart}:${(hash >>> 0).toString(16)}`;
}
