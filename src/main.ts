import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { TasksCalendarRenderer } from "./calendar";
import { TASKS_CALENDAR_VIEW, TasksCalendarView } from "./calendar-view";
import { DEFAULT_SETTINGS, TasksCalendarSettingTab } from "./settings";
import { PerformanceMonitor, PerformanceReportModal } from "./performance";
import { fallbackToggleLine } from "./task-parser";
import { TaskStore } from "./task-store";
import type { CalendarTask, TasksApiV1, TasksCalendarSettings, TasksPluginLike } from "./types";
import type { CalendarState } from "./types";

interface ObsidianAppWithPlugins {
  plugins?: {
    plugins?: Record<string, TasksPluginLike>;
  };
}

export default class TasksCalendarPlugin extends Plugin {
  settings: TasksCalendarSettings = DEFAULT_SETTINGS;
  taskStore!: TaskStore;
  readonly performanceMonitor = new PerformanceMonitor();
  private embeddedCalendars = new Set<TasksCalendarRenderer>();
  private stateSaveTimer: number | null = null;

  get tasksApi(): TasksApiV1 | null {
    const app = this.app as typeof this.app & ObsidianAppWithPlugins;
    return app.plugins?.plugins?.["obsidian-tasks-plugin"]?.apiV1 ?? null;
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.taskStore = new TaskStore(this.app.vault, this.performanceMonitor);
    await this.taskStore.initialize();

    this.registerView(TASKS_CALENDAR_VIEW, (leaf) => new TasksCalendarView(leaf, this));
    this.addRibbonIcon("calendar-check", "Open Tasks Calendar", () => void this.activateView());
    this.addCommand({
      id: "open-tasks-calendar",
      name: "Open calendar",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "open-tasks-calendar-week",
      name: "Open calendar in week view",
      callback: () => void this.activateView("week")
    });
    this.addCommand({
      id: "show-performance-report",
      name: "Show performance report",
      callback: () => new PerformanceReportModal(this.app, this.performanceMonitor).open()
    });
    this.addCommand({
      id: "reset-performance-measurements",
      name: "Reset performance measurements",
      callback: () => {
        this.performanceMonitor.reset();
        new Notice("Tasks Calendar performance measurements reset.");
      }
    });

    this.registerMarkdownCodeBlockProcessor("tasks-calendar", (source, element, context) => {
      const section = context.getSectionInfo(element);
      const stateKey = embeddedStateKey(context.sourcePath, section?.lineStart ?? -1, source);
      const savedState = this.settings.embeddedViewStates[stateKey];
      const renderer = new TasksCalendarRenderer(
        element,
        this,
        savedState ?? { query: source },
        (state) => this.rememberEmbeddedCalendarState(stateKey, state)
      );
      this.embeddedCalendars.add(renderer);
      context.addChild(renderer);
      renderer.register(() => this.embeddedCalendars.delete(renderer));
    });

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile) this.taskStore.scheduleFile(file);
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile) this.taskStore.scheduleFile(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.taskStore.removePath(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile) this.taskStore.renamePath(file, oldPath);
    }));
    this.addSettingTab(new TasksCalendarSettingTab(this.app, this));
  }

  onunload(): void {
    if (this.stateSaveTimer !== null) {
      window.clearTimeout(this.stateSaveTimer);
      this.stateSaveTimer = null;
      void this.saveSettings();
    }
    this.app.workspace.detachLeavesOfType(TASKS_CALENDAR_VIEW);
  }

  async activateView(mode?: "week" | "month"): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(TASKS_CALENDAR_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({
        type: TASKS_CALENDAR_VIEW,
        active: true,
        state: {
          ...(this.settings.lastViewState ?? {}),
          ...(mode ? { mode } : {})
        }
      });
    } else if (mode) {
      await leaf.setViewState({ type: TASKS_CALENDAR_VIEW, active: true, state: { mode } });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async toggleTask(task: CalendarTask): Promise<void> {
    try {
      const replacement = this.tasksApi?.executeToggleTaskDoneCommand(task.raw, task.path) ?? fallbackToggleLine(task.raw);
      await this.taskStore.replaceTask(task, replacement);
    } catch (error) {
      new Notice(`Could not update task: ${messageFrom(error)}`);
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

  async openTask(task: CalendarTask): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${task.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true, eState: { line: task.line } });
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      view.editor.setCursor({ line: task.line, ch: Math.max(0, task.raw.indexOf(task.description)) });
      view.editor.scrollIntoView({
        from: { line: task.line, ch: 0 },
        to: { line: task.line, ch: task.raw.length }
      }, true);
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

  async loadSettings(): Promise<void> {
    const data = await this.loadData() as Partial<TasksCalendarSettings> | null;
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
